/**
 * Petsona catalogue AI demo: one merchant product in, evidence-backed typed
 * decisions out.
 *
 * Pipeline shown here (the same code that runs inside the Petsona Shopify app):
 *   1. capture evidence spans from the merchant's own product text
 *   2. deterministic extraction proposes attributes with evidence IDs
 *   3. every proposed value becomes one atomic, typed four-way question
 *   4. a decision model (TypeSafe Jev or open-weight Laya) answers all
 *      questions in a single forward pass with calibrated probabilities
 *   5. nothing is published automatically without a validated acceptance
 *      policy; the merchant approves supported fields, which become tags
 *
 * Without TYPESAFE_API_KEY or AI_GATEWAY_API_KEY the demo stops after step 4
 * and shows exactly what would have been sent.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import {
  extractProposals,
  acceptedClassification,
  RULE_VERSION,
  type CatalogueProduct,
  type CatalogueProposal,
} from "../src/catalogue/extract.server";
import {
  attributeDecisions,
  decisionQuestion,
  decisionState,
  applyAttributeDecisions,
  DECISION_CRITERIA,
  DECISION_PROMPT_VERSION,
  type AttributeVerdict,
} from "../src/catalogue/decision-plan";
import { classificationTags } from "../src/contracts/index";

type Provider = "jev" | "laya-free";
const ENDPOINT: Record<Provider, string> = {
  jev: "https://api.typesafe.ai/v1/systemone",
  "laya-free": "https://ai-gateway.vercel.sh/v1/evaluate",
};
const MODEL: Record<Provider, string> = {
  jev: "jev-1.13.0",
  "laya-free": "convaiinnovations/laya-free",
};

function heading(title: string) {
  console.log(`\n${title}\n${"-".repeat(title.length)}`);
}
function clip(text: string, max = 110) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run demo -- demo/samples/<product>.json");
  process.exit(1);
}
const product = JSON.parse(readFileSync(file, "utf8")) as CatalogueProduct;
console.log(`Petsona catalogue AI demo: ${product.title} (${basename(file)})`);

const proposal = extractProposals(product);
heading(
  `1. Evidence spans captured from the merchant's product (${proposal.evidence.length})`,
);
for (const span of proposal.evidence)
  console.log(`  [${span.id}] ${span.source}: ${clip(span.text)}`);

heading(`2. Deterministic proposals (${RULE_VERSION})`);
const fieldRows = Object.entries(proposal.fields);
if (!fieldRows.length)
  console.log("  (no attribute could be proposed from the source text)");
for (const [key, field] of fieldRows)
  console.log(
    `  ${key.padEnd(17)} ${JSON.stringify(field.value).padEnd(34)} ${field.status.padEnd(12)} evidence: ${field.evidenceIds.join(", ")}`,
  );
if (proposal.issues.length)
  console.log(`  issues: ${proposal.issues.join(", ")}`);

const jobs = attributeDecisions(proposal);
heading(
  `3. Typed decisions planned for the model (${jobs.length}, prompt ${DECISION_PROMPT_VERSION})`,
);
for (const job of jobs)
  console.log(
    `  ${job.id.padEnd(22)} value ${JSON.stringify(job.value).padEnd(30)} evidence ${job.evidence.map((e) => e.id).join(", ") || "(none)"}`,
  );
if (jobs[0]) {
  const question = decisionQuestion(jobs[0]);
  console.log(`\n  Example question for ${jobs[0].id}:`);
  console.log(`    ${question.instructions}`);
  for (const [label, description] of Object.entries(DECISION_CRITERIA))
    console.log(`    - ${label}: ${description}`);
}

const provider: Provider | null = process.env.TYPESAFE_API_KEY
  ? "jev"
  : process.env.AI_GATEWAY_API_KEY
    ? "laya-free"
    : null;
const body = {
  model: MODEL[provider ?? "jev"],
  // A string keeps the shared state byte-identical to what was admitted.
  state: JSON.stringify(decisionState(jobs)),
  questions: Object.fromEntries(
    jobs.map((job) => [job.id, decisionQuestion(job)]),
  ),
  ...(provider === "laya-free"
    ? { providerOptions: { gateway: { only: ["boundless"] } } }
    : {}),
};
heading("4. Model call");
console.log(
  `  request: ${Buffer.byteLength(JSON.stringify(body))} bytes, ${jobs.length} questions answered in one forward pass`,
);

async function main() {
  let decided: CatalogueProposal = proposal;
  if (!provider || !jobs.length) {
    console.log(
      "  dry run: no TYPESAFE_API_KEY or AI_GATEWAY_API_KEY in the environment, so no model was called.",
    );
    console.log(
      "  The model never generates text. It returns one of supported / contradicted / unknown / conflicting",
    );
    console.log(
      "  per attribute, with a probability distribution over those four options.",
    );
  } else {
    const key =
      provider === "jev"
        ? process.env.TYPESAFE_API_KEY
        : process.env.AI_GATEWAY_API_KEY;
    const response = await fetch(ENDPOINT[provider], {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(
        `${provider} responded ${response.status}: ${clip(await response.text(), 300)}`,
      );
    const result = JSON.parse(await response.text()) as {
      model?: string;
      answers?: Record<string, Record<string, unknown>>;
    };
    if (
      result.model !== MODEL[provider] &&
      !(provider === "laya-free" && result.model === "convaiinnovations/laya")
    )
      throw new Error(`Unexpected model in response: ${result.model}`);
    const expectedKeys = Object.keys(DECISION_CRITERIA).sort().join();
    const answers: Record<string, AttributeVerdict> = {};
    for (const job of jobs) {
      const answer = result.answers?.[job.id];
      const probabilities = answer?.probabilities as
        | Record<string, number>
        | undefined;
      if (
        !answer ||
        answer.type !== "choice" ||
        !Object.hasOwn(DECISION_CRITERIA, String(answer.choice)) ||
        !probabilities ||
        Object.keys(probabilities).sort().join() !== expectedKeys
      )
        throw new Error(`Invalid or malformed answer for ${job.id}`);
      const choice = answer.choice as AttributeVerdict["choice"];
      answers[job.id] = {
        choice,
        confidence:
          typeof answer.confidence === "number" ? answer.confidence : 0,
        probability: Number(probabilities[choice]),
      };
    }
    decided = applyAttributeDecisions(
      proposal,
      jobs,
      answers,
      provider,
      RULE_VERSION,
    );
    console.log(`  provider: ${provider} (${result.model})`);
    heading("5. Verdicts");
    for (const job of jobs) {
      const answer = answers[job.id];
      console.log(
        `  ${job.id.padEnd(22)} ${JSON.stringify(job.value).padEnd(30)} ${answer.choice.padEnd(12)} p=${(answer.probability ?? 0).toFixed(3)} confidence=${answer.confidence.toFixed(3)}`,
      );
    }
  }

  heading(`${provider && jobs.length ? 6 : 5}. What reaches the store`);
  const automatic = acceptedClassification(decided, {}, {});
  console.log(
    `  automatically, with no validated acceptance policy: ${classificationTags(automatic).join(", ") || "(nothing)"}`,
  );
  const approved = Object.fromEntries(
    Object.entries(decided.fields).filter(
      ([, field]) => field.status === "supported",
    ),
  ) as Parameters<typeof acceptedClassification>[1];
  const afterReview = acceptedClassification(decided, approved, {});
  console.log(
    `  after the merchant approves the supported fields: ${classificationTags(afterReview).join(", ") || "(nothing)"}`,
  );
  console.log(
    "  Allergen absence is never inferred. It is published only from the merchant's explicit attestation.",
  );
}

main().catch((error) => {
  console.error(
    `\nDemo failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
