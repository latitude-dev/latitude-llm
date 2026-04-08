# @platform/ai-voyage

Effect layers for [Voyage AI](https://www.voyageai.com/) embeddings and reranking (`AIEmbedLive`, `AIRerankLive`).

## ESM workaround (`createRequire`)

This package is ESM (`"type": "module"`). The official `voyageai` TypeScript SDK does not load correctly via native ESM `import` in our toolchain (see [voyage-ai/typescript-sdk#26](https://github.com/voyage-ai/typescript-sdk/issues/26)).

We load the client with Node’s `createRequire` so the SDK is resolved as CommonJS. Types still come from `import type { VoyageAIClient } from "voyageai"`.

**Catalog version when documented:** `voyageai@0.2.1` (see root `pnpm-workspace.yaml`).

### When to remove the workaround

1. Confirm [voyage-ai/typescript-sdk#26](https://github.com/voyage-ai/typescript-sdk/issues/26) is fixed in a published release.
2. Bump the workspace catalog `voyageai` entry to that release.
3. Replace the `createRequire`/`require("voyageai")` block in `src/ai.ts` with a normal `import { VoyageAIClient } from "voyageai"`.
4. Run `pnpm --filter @platform/ai-voyage typecheck` and any consuming app checks.

### Tracking and re-checks

- **Upstream:** [voyage-ai/typescript-sdk#26](https://github.com/voyage-ai/typescript-sdk/issues/26)
- **Internal chore / acceptance criteria:** [latitude-llm#2607](https://github.com/latitude-dev/latitude-llm/issues/2607), Linear [AGE-38](https://linear.app/latitude/issue/AGE-38/p2-esm-workaround-in-ai-voyage-document-and-monitor)
- **Re-evaluate** whenever the `voyageai` catalog version changes, or at least every six months (next suggested review: **2026-10-08**), whichever comes first.
