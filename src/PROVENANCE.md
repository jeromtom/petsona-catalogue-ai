# Source provenance

Every file under `src/` is a verbatim snapshot from the private Petsona monorepo `jeromtom/petsona`, branch `dev`, commit `c03be54bbfdf04d22e9a238dc09123fa660fcd01` (24 October 2026), except for the two mechanical changes listed below.

| Here | In the monorepo |
| --- | --- |
| `src/contracts/**` | `packages/contracts/src/**` and `packages/contracts/fixtures/**` |
| `src/catalogue/**` | `apps/petsona/app/lib/catalogue/**` (pure modules only) |
| `src/constants.ts` | `apps/petsona/app/lib/constants.ts` |

Changes made for this snapshot:

1. `src/contracts/__tests__/fixtures.test.ts`: fixture path `../../fixtures/` became `../fixtures/` because the fixtures folder now sits beside the sources.
2. `constants.ts` moved one level up so `attribute-discovery.ts` resolves `../constants` unchanged.

Modules deliberately left out because they need PostgreSQL, Shopify sessions or Google Cloud credentials: `decision.server.ts` (the provider call with spend ledger and admission slots), `decision-context.server.ts` (token-window splitting with the pinned Laya tokenizer), `budget.server.ts`, `decision-throttle.server.ts`, `state.server.ts`, `worker.server.ts`, `tasks.server.ts`, `manufacturer.server.ts`, `shopify.server.ts`, `finder.server.ts`. The demo CLI `demo/classify.ts` reproduces the provider request and response validation from `decision.server.ts` without the database.
