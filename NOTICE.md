# Third-party notices and attributions

This repository is MIT licensed (see `LICENSE`). It depends on, calls, or was built on the following third-party work. Nothing below is redistributed here except where stated.

| Component | Role in Petsona | Licence / terms | Notes |
| --- | --- | --- | --- |
| [Laya](https://github.com/NandhaKishorM/laya) by Convai Innovations (`convaiinnovations/laya`) | Open-weight typed decision model used for catalogue attribute verdicts | Apache-2.0 (weights and runtime) | No weights are in this repository. The Petsona app pins the tokenizer files at Hugging Face revision `7b928d82…` with SHA-256 checks for token budgeting; see `docs/laya-tokenizer-provenance.json`. Served during the pilot through the Vercel AI Gateway free alias `convaiinnovations/laya-free` (promotion ends 31 October 2026). |
| [TypeSafe Jev](https://docs.typesafe.ai/models) `jev-1.13.0` | Hosted typed decision model, same request shape | Commercial API terms | Pinned version, never the moving alias. US$0.042 per million input tokens as listed on 28 September 2026. |
| [Google Cloud Vision](https://cloud.google.com/vision) document text detection | Reads ingredient statements from the merchant's own label photos | Google Cloud terms | Off by default. Only `cdn.shopify.com` images, at most three per product. |
| [Groq](https://groq.com) hosting `openai/gpt-oss-120b` | In the main Petsona app only: re-orders an already filtered Pet Picks shortlist and drafts campaign copy | Groq API terms; gpt-oss weights Apache-2.0 | Not part of the classification decision. Not included in this repository. |
| [Shopify](https://shopify.dev) Admin GraphQL API, app proxy, React Router app template | Platform the Petsona app runs on | Shopify Partner terms; template MIT (Shopify Inc.) | The main app repository started from Shopify's template. |
| [vitest](https://vitest.dev), [tsx](https://tsx.is), [TypeScript](https://www.typescriptlang.org) | Test and run tooling in this repository | MIT / Apache-2.0 | Dev dependencies only. |

Product names and sample texts in `demo/samples/` are fictional and written for this demonstration. Screenshots in `docs/screenshots/` show Petsona's own development store, `persona-app-test-store`, with demonstration products.
