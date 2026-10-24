import { describe, expect, it, vi } from "vitest";
import { extractProposals } from "../extract.server";
import {
  fetchShopifyImage,
  ingredientBlock,
  isShopifyImageUrl,
  ocrIngredientEvidence,
  visionDocumentText,
  type OcrDependencies,
} from "../ocr.server";

const label = `PREMIUM ADULT DOG FOOD
Composition: Lamb (26%), brown rice, dried whey,
poultry fat, beet pulp.
Analytical constituents: Protein 24%, Fat 14%.
Feeding guide: see table.`;

describe("ingredientBlock", () => {
  it("joins wrapped lines and stops at the next section", () => {
    expect(ingredientBlock(label)).toBe(
      "Ingredients: Lamb (26%), brown rice, dried whey, poultry fat, beet pulp.",
    );
  });
  it("returns null without a clear heading", () => {
    expect(ingredientBlock("Lamb, rice and whey. Made with love.")).toBeNull();
  });
});

describe("isShopifyImageUrl", () => {
  it("accepts only https Shopify CDN images", () => {
    expect(isShopifyImageUrl("https://cdn.shopify.com/s/files/1/a.jpg?v=2")).toBe(true);
    expect(isShopifyImageUrl("http://cdn.shopify.com/a.jpg")).toBe(false);
    expect(isShopifyImageUrl("https://cdn.shopify.com.evil.test/a.jpg")).toBe(false);
    expect(isShopifyImageUrl("https://example.com/a.jpg")).toBe(false);
    expect(isShopifyImageUrl("not a url")).toBe(false);
  });
});

describe("fetchShopifyImage", () => {
  it("rejects non-images, oversize files and other hosts before reading them", async () => {
    await expect(fetchShopifyImage("https://example.com/a.jpg")).rejects.toThrow("ocr_image_not_shopify");
    const html = vi.fn(async () => new Response("<html>", { headers: { "content-type": "text/html" } }));
    await expect(fetchShopifyImage("https://cdn.shopify.com/a.jpg", html)).rejects.toThrow("ocr_image_type");
    const huge = vi.fn(async () => new Response("x", { headers: { "content-type": "image/png", "content-length": String(9 * 1024 * 1024) } }));
    await expect(fetchShopifyImage("https://cdn.shopify.com/a.png", huge)).rejects.toThrow("ocr_image_too_large");
  });
});

describe("visionDocumentText", () => {
  it("sends one document text request billed to the project and averages page confidence", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.requests[0].features).toEqual([{ type: "DOCUMENT_TEXT_DETECTION" }]);
      expect((init?.headers as Record<string, string>)["x-goog-user-project"]).toBe("petsona-prod");
      return Response.json({ responses: [{ fullTextAnnotation: { text: label, pages: [{ confidence: 0.9 }, { confidence: 0.98 }] } }] });
    });
    const result = await visionDocumentText(Buffer.from("png"), "token", "petsona-prod", fetcher);
    expect(result.text).toBe(label);
    expect(result.confidence).toBeCloseTo(0.94);
  });
  it("treats an API error as a failure, never as empty text", async () => {
    const fetcher = vi.fn(async () => Response.json({ responses: [{ error: { message: "bad image" } }] }));
    await expect(visionDocumentText(Buffer.from("x"), "t", "p", fetcher)).rejects.toThrow("vision_annotation_failed");
  });
});

describe("ocrIngredientEvidence", () => {
  const deps = (overrides: Partial<OcrDependencies> = {}) => {
    const store = new Map<string, { text: string; confidence: number }>();
    const calls = { reserve: 0, recognise: 0, settled: [] as Array<number | null> };
    const d: OcrDependencies = {
      fetchImage: async (url) => Buffer.from(url),
      cached: async (hash) => store.get(hash),
      store: async (hash, result) => void store.set(hash, result),
      reserve: async () => (calls.reserve++, true),
      settle: async (_hash, micros) => void calls.settled.push(micros),
      recognise: async () => (calls.recognise++, { text: label, confidence: 0.95 }),
      now: new Date("2026-10-23T00:00:00Z"),
      ...overrides,
    };
    return { d, calls };
  };

  it("turns a confident label into a traceable ingredients span, paying once per image", async () => {
    const { d, calls } = deps();
    const urls = ["https://cdn.shopify.com/s/files/label.jpg?v=3", "https://example.com/hotlink.jpg"];
    const spans = await ocrIngredientEvidence(urls, d);
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toMatch(/^Ingredients: Lamb \(26%\)/);
    expect(spans[0].source).toMatch(/^vision-document-text-v1:https:\/\/cdn\.shopify\.com\/s\/files\/label\.jpg#sha256=[0-9a-f]{64}$/);
    await ocrIngredientEvidence(urls, d);
    expect(calls).toEqual({ reserve: 1, recognise: 1, settled: [1500] });
  });

  it("discards low-confidence text and never reads more than three images", async () => {
    const { d, calls } = deps({ recognise: async () => ({ text: label, confidence: 0.6 }) });
    const urls = [1, 2, 3, 4, 5].map((n) => `https://cdn.shopify.com/s/files/${n}.jpg`);
    expect(await ocrIngredientEvidence(urls, d)).toEqual([]);
    expect(calls.reserve).toBe(3);
  });

  it("never resends an image whose earlier outcome is unknown", async () => {
    const recognise = vi.fn();
    const { d } = deps({ reserve: async () => false, recognise });
    expect(await ocrIngredientEvidence(["https://cdn.shopify.com/a.jpg"], d)).toEqual([]);
    expect(recognise).not.toHaveBeenCalled();
  });

  it("settles failed HTTP calls at zero and keeps unknown outcomes reserved", async () => {
    const http = deps({ recognise: async () => { throw new Error("vision_http_503"); } });
    await expect(ocrIngredientEvidence(["https://cdn.shopify.com/a.jpg"], http.d)).rejects.toThrow("vision_http_503");
    expect(http.calls.settled).toEqual([0]);
    const timeout = deps({ recognise: async () => { throw new Error("The operation was aborted"); } });
    await expect(ocrIngredientEvidence(["https://cdn.shopify.com/a.jpg"], timeout.d)).rejects.toThrow();
    expect(timeout.calls.settled).toEqual([null]);
  });

  it("stops before any billable call when the budget is closed", async () => {
    const recognise = vi.fn();
    const { d } = deps({ reserve: async () => { throw new Error("budget_closed"); }, recognise });
    await expect(ocrIngredientEvidence(["https://cdn.shopify.com/a.jpg"], d)).rejects.toThrow("budget_closed");
    expect(recognise).not.toHaveBeenCalled();
  });

  it("feeds the shared taxonomy: present, possible and conflicting evidence all apply", async () => {
    const { d } = deps();
    const spans = await ocrIngredientEvidence(["https://cdn.shopify.com/label.jpg"], d);
    const product = { id: "gid://shopify/Product/1", title: "Lamb food", description: "Complete food for adult dogs.", vendor: "V", productType: "Dog food", tags: [], region: "IN", variants: [] };
    const fromLabel = extractProposals(product, spans);
    expect(fromLabel.fields.allergens?.value).toEqual(["dairy", "grain"]);
    expect(fromLabel.fields.allergensPossible?.value).toEqual(["chicken"]);
    const disagreeing = extractProposals({ ...product, description: "Complete food for adult dogs. Ingredients: lamb, potato." }, spans);
    expect(disagreeing.fields.ingredients?.status).toBe("conflicting");
  });
});
