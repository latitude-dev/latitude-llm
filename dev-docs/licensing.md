# Dependency licensing & self-hosting

The durable record of Latitude's dependency-license posture and the policy that keeps it clean. Latitude itself is MIT.

## The question that matters: does any license prohibit self-hosting Latitude?

**No.** No dependency license prohibits deploying Latitude yourself, at any scale, for hobby **or** commercial/business use. The few non-permissive items are either (a) external services whose restrictive clause triggers only if you *resell that service itself* (Redis), (b) dev-only and stripped from the shipped build, or (c) copyleft Latitude already satisfies by being public MIT source. The policy below is about keeping the stack *cleanly* OSS, not about the legality of self-hosting.

**Scope of the audit.** Every shipped/required dependency of the product: the infra services you run, the AI provider SDKs we call, and the application libraries (TypeScript **and** Python). It excludes `infra/` (Pulumi — Latitude's own cloud, not a self-hoster's dependency). Ground-truth method: JS from `pnpm licenses list --json` over the full installed tree (~1,900 unique package@version, direct + transitive, all platforms); Python from each `pyproject.toml` + installed `METADATA`; infra images at their running versions; AI from declared SDK deps + provider terms. First full audit: **2026-06-09** — re-run when dependencies change materially.

## The only non-permissive findings

| Dependency | License | Ships in product? | Prohibits self-deploy? | Disposition |
| --- | --- | --- | --- | --- |
| **Redis** (`redis:7`) | RSALv2 / SSPLv1 (source-available, non-OSS) | Run as a service (cache + BullMQ) | **No** — RSAL/SSPL only restrict offering *Redis itself* as a managed service; internal use is unrestricted | **Kept as-is.** Valkey / `redis:7.2` (BSD-3) remain optional fully-OSS drop-ins for stricter operators |
| **ua-parser-js** | AGPL-3.0-or-later | Was a runtime dep in `apps/web` | **No** — AGPL's source-offer duty is already met by Latitude's public MIT source | **Removed** — replaced with `bowser` (MIT) so the shipped app carries no copyleft |
| **MinIO** | AGPL-3.0 | **Not a dependency** | — | **Never used.** Self-host object store is SeaweedFS (Apache-2.0); BYO any S3-compatible store |
| **agentation** | PolyForm-Shield-1.0.0 (source-available) | **No** — `devDependency`, DEV-gated, dead-code-eliminated from prod | **No** — never shipped | Keep dev-only; never promote to a runtime dependency |
| **@img/sharp-libvips-\*** | LGPL-3.0-or-later | Yes (transitive platform binary, via `sharp`) | **No** — dynamically-linked, unmodified prebuilt; permits commercial use | No action |

## Infrastructure services

| Service | Image / source | License | Self-host restriction |
| --- | --- | --- | --- |
| PostgreSQL + pgvector | `pgvector/pgvector:pg16` | PostgreSQL License | None |
| ClickHouse | `clickhouse/clickhouse-server` | Apache-2.0 | None |
| Redis (cache + BullMQ) | `redis:7` | RSALv2 / SSPLv1 | None for internal use (see above) |
| Temporal (server + UI) | `temporalio/*` | MIT | None |
| Object storage | bundled **SeaweedFS** / BYO S3 via `@aws-sdk/client-s3` | Apache-2.0 | None |
| Mailpit (dev SMTP) | `axllent/mailpit` | MIT | None (dev only) |

No MongoDB, Elasticsearch, or other SSPL/Elastic/BSL-licensed datastore is used.

## AI provider SDKs

The model-provider **client SDKs are all OSS** (Apache-2.0 / MIT): `voyageai` (MIT), `@ai-sdk/amazon-bedrock` + `@aws-sdk/client-bedrock-runtime` (Apache-2.0), `@anthropic-ai/sdk` (MIT) / `@ai-sdk/anthropic` (Apache-2.0), `openai` + `@ai-sdk/openai` (Apache-2.0), `cohere-ai` (MIT), and the Vercel AI SDK core `ai` / `@ai-sdk/provider` (Apache-2.0). The default providers are proprietary *paid services* — a **functional** limitation (a key is needed), **not** a license that forbids self-hosting or commercial use. The `openai` SDK also targets any OpenAI-compatible server (Ollama, vLLM, LM Studio), which is the fully-OSS local-model path.

## Application libraries

**TypeScript** installed-tree distribution (~1,900 unique entries): ~1,114 MIT, 297 Apache-2.0, 92 ISC, ~47 BSD-2/3-Clause, 6 MPL-2.0 (weak file-level copyleft, no use restriction), ~10 public-domain-equivalent (CC0/Unlicense/0BSD/WTFPL/Zlib/PSF), 2 attribution-only data sets — and exactly the three non-permissive entries listed above. All core chosen runtime libraries are permissive: Hono, TanStack, React, Better Auth (MIT); Drizzle ORM, `@clickhouse/client` (Apache-2.0); `pg`, ioredis, BullMQ, nodemailer, Effect, Zod (MIT). Toolchain (Vite, Turbo, Vitest, Biome, TypeScript) is MIT/Apache-2.0. The in-app PDF viewer is `pdfjs-dist` (Apache-2.0), including the font, CMap, ICC and wasm decoder payloads it fetches at runtime — these are self-hosted under `/pdfjs/<version>/` rather than pulled from the pdf.js CDN, so an air-gapped deployment renders PDFs correctly.

**Python** — both projects are all-permissive: `latitude-telemetry` (MIT; the published client SDK, instruments the *user's* app, not part of the server) depends only on OpenTelemetry/OpenLLMetry/OpenInference (Apache-2.0), pydantic (MIT), and PSF-licensed stdlib extensions; `latitude-op-gepa` (optional internal optimizer) is `gepa` (MIT) + pydantic.

## Policy (escalated to AGENTS.md)

These rules keep the stack cleanly OSS and self-hostable; the durable form lives in `AGENTS.md` → Repo-wide conventions:

1. **Shipped runtime dependencies must be permissive** (MIT / Apache-2.0 / BSD / ISC). No AGPL / SSPL / source-available license in the application bundle. Audit a new dependency's license (and its transitive additions) before adding it.
2. **The self-host object store is SeaweedFS** (Apache-2.0). Never reintroduce MinIO or any AGPL store as a bundled default.
3. **Redis stays as-is** despite RSAL/SSPL — internal use is unrestricted — and Valkey / `redis:7.2` remain documented OSS drop-ins for operators whose policy forbids source-available licenses.
4. **Infra dependencies must stay isolatable and bring-your-own-able** (dedicated schema/db/namespace/bucket, namespaced Redis keys) so a self-hoster can swap any bundle for a managed equivalent.
</content>
