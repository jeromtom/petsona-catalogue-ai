import { createHash } from "node:crypto";
import type { EvidenceSpan } from "./extract.server";

/**
 * Ingredient evidence read from the merchant's own product images with
 * Google Cloud Vision document text detection. OCR text only becomes an
 * "Ingredients:" evidence span; the shared taxonomy and conflict rules decide
 * what it means. Nothing here asserts that an allergen is absent.
 */
export const OCR_VERSION = "vision-document-text-v1";
export const OCR_MAX_IMAGES = 3;
export const OCR_MAX_BYTES = 8 * 1024 * 1024;
/** Blocks Vision is less sure about than this are discarded, not reviewed. */
export const OCR_MIN_CONFIDENCE = 0.85;
/** Billed per image in micro-dollars (US$1.50 per 1,000 after the free tier, checked 2026-10-23). */
export const OCR_COST_MICROS = 1500;

/** Off unless explicitly switched on with a Google Cloud project to bill. */
export function ocrProject(): string | null {
  const project = process.env.PETSONA_OCR_PROJECT?.trim();
  return process.env.PETSONA_CATALOGUE_OCR === "on" && project ? project : null;
}

/** True when existing text evidence already carries an ingredient list. */
export function hasIngredientList(texts: readonly string[]): boolean {
  return texts.some((text) => /\bingredients\s*:/i.test(text));
}

/** Only the merchant's own Shopify-hosted images are fetched. */
export function isShopifyImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname === "cdn.shopify.com";
  } catch {
    return false;
  }
}

const SECTION_END =
  /\b(?:analytical constituents|typical analysis|guaranteed analysis|nutritional additives|additives|feeding guide(?:lines)?|feeding instructions|directions|storage|best before|net (?:weight|wt)|manufactured by|calorie content)\b/i;

/**
 * Finds the ingredient list in OCR text and returns it as one line starting
 * with "Ingredients:", or null when there is no clear heading.
 */
export function ingredientBlock(text: string): string | null {
  const flat = text.replace(/\s+/g, " ").trim();
  const heading = /\b(?:ingredients|composition)\s*[:.]/i.exec(flat);
  if (!heading) return null;
  let body = flat.slice(heading.index + heading[0].length);
  const end = SECTION_END.exec(body);
  if (end) body = body.slice(0, end.index);
  body = body.trim().replace(/[\s.;,]+$/, "");
  if (body.length < 3 || body.length > 4000) return null;
  return `Ingredients: ${body}.`;
}

export interface VisionResult {
  text: string;
  confidence: number;
}

/** Document text detection for one image via the Vision REST API. */
export async function visionDocumentText(
  image: Buffer,
  accessToken: string,
  project: string,
  fetcher: typeof fetch = fetch,
): Promise<VisionResult> {
  const response = await fetcher(
    "https://vision.googleapis.com/v1/images:annotate",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-goog-user-project": project,
      },
      body: JSON.stringify({
        requests: [
          {
            image: { content: image.toString("base64") },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok) throw new Error(`vision_http_${response.status}`);
  const body = (await response.json()) as {
    responses?: Array<{
      error?: { message?: string };
      fullTextAnnotation?: {
        text?: string;
        pages?: Array<{ confidence?: number }>;
      };
    }>;
  };
  const result = body.responses?.[0];
  if (!result || result.error) throw new Error("vision_annotation_failed");
  const pages = result.fullTextAnnotation?.pages ?? [];
  const confidence = pages.length
    ? pages.reduce((sum, page) => sum + (page.confidence ?? 0), 0) /
      pages.length
    : 0;
  return { text: result.fullTextAnnotation?.text ?? "", confidence };
}

/** Access token for the Cloud Run service identity. */
export async function metadataAccessToken(
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await fetcher(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) throw new Error("ocr_identity_unavailable");
  return ((await response.json()) as { access_token: string }).access_token;
}

export interface OcrDependencies {
  fetchImage: (url: string) => Promise<Buffer>;
  /** Cached result for this image and OCR version, or undefined. */
  cached: (imageHash: string) => Promise<VisionResult | undefined>;
  store: (imageHash: string, result: VisionResult) => Promise<void>;
  /**
   * Reserves spend before a billable call. False means this image was already
   * admitted (an earlier outcome is unknown), so it is not sent again.
   * Throws when the budget is closed.
   */
  reserve: (imageHash: string) => Promise<boolean>;
  /** Settles a reservation: billed micros, 0 when not billed, null when unknown. */
  settle: (imageHash: string, micros: number | null) => Promise<void>;
  recognise: (image: Buffer) => Promise<VisionResult>;
  now?: Date;
}

/** Bounded image download from the Shopify CDN. */
export async function fetchShopifyImage(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<Buffer> {
  if (!isShopifyImageUrl(url)) throw new Error("ocr_image_not_shopify");
  const response = await fetcher(url, {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`ocr_image_http_${response.status}`);
  if (!/^image\/(?:jpeg|png|webp|gif)\b/.test(response.headers.get("content-type") ?? ""))
    throw new Error("ocr_image_type");
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > OCR_MAX_BYTES) throw new Error("ocr_image_too_large");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > OCR_MAX_BYTES) throw new Error("ocr_image_too_large");
  return bytes;
}

/**
 * Reads ingredient lists from up to OCR_MAX_IMAGES product images. Each
 * confident block becomes an evidence span whose source names the image and
 * its content hash, so the evidence is traceable and replayable.
 */
export async function ocrIngredientEvidence(
  imageUrls: readonly string[],
  deps: OcrDependencies,
): Promise<EvidenceSpan[]> {
  const spans: EvidenceSpan[] = [];
  const capturedAt = (deps.now ?? new Date()).toISOString();
  for (const url of imageUrls.filter(isShopifyImageUrl).slice(0, OCR_MAX_IMAGES)) {
    const image = await deps.fetchImage(url);
    const imageHash = createHash("sha256").update(image).digest("hex");
    let result = await deps.cached(imageHash);
    if (!result) {
      if (!(await deps.reserve(imageHash))) continue;
      let billed: number | null = null;
      try {
        result = await deps.recognise(image);
        billed = OCR_COST_MICROS;
      } catch (error) {
        // Google does not bill failed HTTP requests; other failures stay unknown.
        if (error instanceof Error && error.message.startsWith("vision_http_"))
          billed = 0;
        throw error;
      } finally {
        await deps.settle(imageHash, billed);
      }
      await deps.store(imageHash, result);
    }
    if (result.confidence < OCR_MIN_CONFIDENCE) continue;
    const block = ingredientBlock(result.text);
    if (!block) continue;
    spans.push({
      id: `ocr:${imageHash.slice(0, 16)}`,
      text: block,
      source: `${OCR_VERSION}:${url.split("?")[0]}#sha256=${imageHash}`,
      capturedAt,
    });
  }
  return spans;
}
