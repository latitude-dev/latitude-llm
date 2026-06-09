# OSS-friendly & self-hostable Latitude

> **Documentation**: `dev-docs/deployment.md`, `dev-docs/network-diagram.md`, `infra/README.md`, `README.md`, `CONTRIBUTING.md`, `.env.example`, `docker-compose.yml`, `.tmuxinator.yml` — and a new self-hosting guide under `docs/` (Mintlify) created across Phases 2–4.

This spec tracks the initiative to make the Latitude product — and therefore this repository — the most **OSS-friendly and self-host-ready** it can be. It is a living document: high-level context, goals, and milestones are captured here so they aren't lost, and detail will be filled in as more information and decisions arrive.

## Strategy & sequencing

The fastest path to value is a **great self-hosting experience and documentation first**, even with current limitations — most notably that **AI-dependent features still require proprietary providers** (Voyage AI for embeddings/reranking; Amazon Bedrock / Anthropic for internal LLM flows). We **accept and clearly document** that requirement in the near term rather than letting it block shipping a usable self-host.

We then **polish**: add OSS/pluggable AI providers so the stack can run on fully open models, and **update the self-hosting docs** accordingly once that lands.

**Documentation ships *with* each tier, not after.** Each self-hosting tier below lands together with the docs that make it usable — docs are part of the deliverable, not a follow-up.

## Self-hosting tiers

We define **three tiers** of running Latitude, increasing in operational complexity and in production-readiness. Each is a first-class, documented path. *(Tier names below are provisional — open to rename.)*

### Tier 1 — Local (development)

For contributors and people evaluating Latitude on their machine. **Infra-only Docker Compose** (Postgres, ClickHouse, Redis, Mailpit, Temporal) with the **Latitude services run directly by the developer** for hot reload and good DevEx — `pnpm dev` (Turbo) or the existing **`.tmuxinator.yml`** layout that already starts infra + `api`/`ingest`/`web`/`workers`/`workflows` + pg studio in panes. Optimized for **fast iteration**, not durability. **Object storage:** the local **`fs`** driver (a mounted directory) — no object store to run.

### Tier 2 — Single-host (Docker Compose) — *"production, the easy way"*

A simple, straightforward way to run a **production-grade Latitude instance on a single machine** entirely via Docker Compose: all **application services** (`web`, `api`, `ingest`, `workers`, `workflows`) **plus** infra, using **published container images** (no build step), sane production defaults, and one `.env`. This is the **headline near-term deliverable** for "easy self-hosting." **Object storage:** bundles **SeaweedFS** (Apache-2.0) as a single-container all-in-one S3 service behind the existing `s3` driver — or point at any S3-compatible / managed store (`fs` on a shared volume also works on a single host). One-click PaaS templates (Phase 6) are a convenience layer on top of this tier.

### Tier 3 — Cluster / Cloud (advanced) — *"production, the scalable way"*

A little less simple but still straightforward way to deploy a **scalable, HA, production-grade Latitude** on a Kubernetes cluster — any managed k8s (EKS/GKE/AKS) or on-prem/bare-metal. Delivered as a **cloud-agnostic Helm chart** (+ raw manifests) using the same published container images and env contract: a Deployment per service (`web`, `api`, `ingest`, `workers`, `workflows`), ingress, PVCs, secrets, and a migration job. **Object storage:** **SeaweedFS** (Apache-2.0) via its official Helm chart (standalone → distributed/erasure-coded for HA), or bring your own managed S3 — both behind the same `s3` driver.

> **Why k8s/Helm lives in Tier 3, not Tier 2:** Helm presupposes a running cluster, ingress controller, persistent volumes, and secret management — advanced-tier prerequisites. It is, however, *portable* and additive: a single chart serves every cloud and on-prem.
>
> **`infra/` is explicitly out of scope and untouched.** The existing Pulumi project is Latitude's own critical, account-specific deploy — it bakes Latitude domains/buckets into shared source (`config.ts`), carries real Pulumi secret state, and is entangled with Latitude-operational concerns (Datadog synthetics, Hex DB access, Tailscale bastion, GitHub OIDC, Temporal Cloud). Generalizing it would be high-risk to the production deploy, AWS-only, and still not clean for third parties. Tier 3 ships a **separate Helm chart instead** and leaves `infra/` alone. GCP/Azure-specific IaC is not pursued.

## Context

Latitude is a multi-tenant LLM observability platform (a pnpm + Turbo monorepo) released under the **MIT License**. The hosted product runs on AWS with several managed/SaaS providers, but the codebase is already structured around clean **ports/adapters** boundaries, which makes swapping proprietary infrastructure for OSS/self-hostable equivalents tractable rather than a rewrite.

### What is already OSS-friendly today (the good news)

- **License**: MIT (`LICENSE`).
- **Local dev infrastructure is already 100% OSS images** via `docker-compose.yml`:
  Postgres (`pgvector/pgvector:pg16`), ClickHouse (`clickhouse/clickhouse-server`), Redis (×2 — cache + BullMQ), Mailpit (local SMTP), and self-hosted Temporal (`temporalio/auto-setup`) + Temporal UI.
- **A working dev orchestration already exists**: `pnpm dev` (`turbo dev`) and `.tmuxinator.yml` (infra + all five services + pg studio in panes) — Tier 1 is largely built, mostly needing polish + docs.
- **Most third-party integrations already degrade to no-ops when their env vars are unset**, so a self-hosted deployment doesn't need them: Mailgun / generic SMTP / SendGrid (email), Google/GitHub OAuth, Slack, Stripe (billing), Datadog/OTEL observability, Intercom (support), PostHog (analytics), Loops (lifecycle email), Cloudflare Turnstile (bot protection), Framer (changelog/CMS), GTM, ipinfo.
- **Sensible OSS defaults** in `.env.example`: email defaults to **Mailpit**, object storage defaults to the **`fs`** driver (S3 is opt-in and speaks to any S3-compatible store), Temporal/ClickHouse can be self-hosted **or** point at their respective Clouds.
- **Object storage is already provider-agnostic** — no new abstraction needed. A `StorageDiskPort` domain port (`@domain/shared/src/storage.ts`) backed by **flydrive** with `fs` and `s3` drivers (the S3 driver takes a custom `LAT_STORAGE_S3_ENDPOINT`), selected by `LAT_STORAGE_DRIVER`. A single `putInDisk` helper enforces org-scoped keys. Files are managed for four namespaces: **ingest** (staging raw OTLP trace payloads for async processing), **datasets** (uploaded CSVs), **exports** / **datasetExports** (generated downloads via signed URLs — native presign on S3, app-hosted HMAC token on `fs`). Swapping local disk ⇄ any S3-compatible store is config, not code.
- **Telemetry ingestion is provider-agnostic**: traces work with any OTLP-compatible runtime and any model provider on the *customer's* side — this is not a lock-in point.
- **An AWS Pulumi project already exists** (`infra/`): VPC, ECS, ALB, RDS/Aurora, ElastiCache/MemoryDB, S3, Secrets Manager, DNS, bastion. It is **intentionally specific to Latitude's own account** (hardcoded domains/buckets and `hostedZoneId` in `config.ts`, real Pulumi secret state, Datadog synthetics, Temporal Cloud, Hex bastion access, GitHub OIDC). It stays **as-is and untouched** — it is Latitude's private deploy, **not** the self-host path. Tier 3 ships a separate, cloud-agnostic Helm chart instead.
- **Clean extension points already exist**: `@domain/ai` defines the `AIEmbed` / `AIRerank` ports (and the LLM provider port), so OSS AI adapters are pluggable by construction when we get to the polish phase.

### Current limitations (accepted for now, documented; lifted in Phase 5)

These are **not blockers** for shipping self-hosting — they are requirements we document plainly, then remove later:

1. **Embeddings + reranking require Voyage AI (non-OSS).**
   `@platform/ai-voyage` is currently the only adapter for the `AIEmbed`/`AIRerank` ports and **throws when `LAT_VOYAGE_API_KEY` is unset** (`"Voyage AI is unavailable: set LAT_VOYAGE_API_KEY."`). These power **semantic/trace search**, **search highlights/reranking**, and **issue clustering**. Near term: a self-hoster sets a Voyage key to enable these; without it, those specific features are unavailable (see P3-4 — the app must still boot and core observability must still work).

2. **Internal AI flows require non-OSS models.**
   Latitude's own AI features (flaggers, evaluations, conversation intelligence, issue summarization, AI generation, annotator optimizations) run on **Amazon Bedrock** (`LAT_AWS_*`) and/or **Anthropic** (`LAT_ANTHROPIC_API_KEY`). Near term: documented as a required provider for those features; not yet pluggable to a local / OpenAI-compatible endpoint.

### The gaps this initiative closes (immediate)

3. **No self-hosting story / documentation.**
   The README quick-start is entirely about the **hosted cloud** ("sign up at latitude.so"). There is **no self-hosting guide**, no documented "run your own Latitude" path, and the existing `docker-compose.yml` only provisions **infrastructure**, not the application services. The `infra/` Pulumi project documents Latitude's *own* deploy, not a third party's. **This is the priority gap.**

4. **No published, ready-to-run application container images** for self-hosters (images are built/pushed to GHCR for Latitude's own deploy; public, versioned, multi-arch images would let Tier 2/3 pull instead of build). *(verify GHCR visibility)*

5. **No one-click / templated deploys.** No Helm chart, generalized IaC, or Railway/Render/Coolify templates exist for third parties.

6. **Likely dead code to clean up.** `@platform/db-weaviate` appears unused (no source consumers; vector storage moved to pgvector). Confirm and quarantine/remove to reduce self-host surface and confusion. *(verify)*

## Goals

1. **Easy self-hosting experience across three tiers** — simple, clear, fast instructions and documentation for Local, Single-host, and Cluster/Cloud. **(Priority)**
2. **Easy development experience (Tier 1)** — trivial to spin up locally with hot reload, run the full test suite **without any proprietary keys**, and contribute.
3. **No hard dependencies on non-OSS / non-self-hostable third parties** — for infra, libraries, **or AI models**. Every feature must eventually be runnable on a fully open stack; proprietary providers may remain as *optional, higher-quality* alternatives. **(Polish — Phase 5; the AI-model part is the remaining piece.)**
4. **(Nice to have, lowest priority) One-click templates** — Railway / Coolify / Render (and evaluate Vercel) so people can deploy in minutes.

### Guiding principles

- **Ship usable self-host first; perfect it after.** Document current proprietary-AI requirements clearly instead of blocking on removing them.
- **One image set, three tiers.** Tiers 2 and 3 deploy the **same published container images** with the same env contract — only orchestration differs.
- **Ports stay; adapters multiply.** Don't rip out proprietary providers — add OSS adapters behind the same ports and make the provider **selectable via env**, with an OSS default for the self-host profile (Phase 5).
- **Graceful degradation, never a crash.** When an optional capability has no provider configured, the feature degrades with a clear message; it must not throw at startup or break unrelated flows. The app must boot and serve core observability with **no proprietary AI keys** set.
- **A single, documented self-host profile.** One blessed configuration verified in CI; today it documents the proprietary-AI requirement, later it becomes fully OSS.
- **Self-host parity for core features.** Observability (ingest + trace viewing) works with zero proprietary keys on every tier; AI-dependent features are enabled by adding the documented providers — until Phase 5 makes open models a first-class option.

### Non-goals (for now)

- Re-architecting tenancy, RLS, or the storage model.
- Removing proprietary providers that are already optional — they stay as opt-in enhancements.
- Matching hosted-cloud model *quality* on open models — we will guarantee *functionality* (Phase 5), not identical output quality.
- **Modifying `infra/`** — Latitude's Pulumi project is critical, account-specific, and stays untouched. Tier 3 is delivered as a **separate, cloud-agnostic Helm chart**, not by generalizing `infra/`. Cloud-specific IaC (AWS/GCP/Azure) is not in scope.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 — Dependency audit & self-host profile definition

Establish the authoritative picture before changing anything; this directly feeds every tier's docs.

- [x] **P1-1**: Produce a dependency matrix covering every third-party infra component, SaaS integration, library, and AI provider/model, with licenses and self-hosting restrictions. → **see [Appendix A](#appendix-a--dependency-license--self-hosting-audit)**.
- [ ] **P1-2**: Audit `.env.example` and tag every var as **required**, **optional**, or **proprietary-enhancement**; identify the minimal var set per tier (and which AI keys unlock which features).
- [ ] **P1-3**: Map exactly which features break without Voyage / Bedrock / Anthropic, and confirm the app still boots and core observability works without them (informs P3-4).
- [ ] **P1-4**: Confirm `@platform/db-weaviate` is dead and list anything else removable; confirm GHCR image visibility / publishing story.
- [ ] **P1-5**: Write down the canonical **self-host profile** (which adapters/images constitute it, and the current proprietary-AI requirement).
- [ ] **P1-6**: **Swap `ua-parser-js@2.0.9` (AGPL-3.0) → `bowser@2.14.1` (MIT)** to make the shipped web app fully permissive (the audit's one shipped copyleft dep — see Appendix A, finding #2). It's used **server-side only**, for cosmetic User-Agent → browser/OS/device labels, in two files: `apps/web/src/domains/admin/users.functions.ts` and `apps/web/src/domains/sessions/user-sessions.functions.ts`. Per file it's two edits — swap the import (`import { UAParser } from "ua-parser-js"` → `import Bowser from "bowser"`), call `Bowser.parse(ua)` instead of `UAParser(ua)`, and change `parsed?.device.type` → `parsed?.platform.type` (`browser.name` / `os.name` map unchanged; `platform.type ∈ {desktop, mobile, tablet, tv}` so the `?? "desktop"` fallback still holds). Remove `ua-parser-js` from / add `bowser` to `apps/web/package.json` (bowser is **already in the lockfile** via `@aws-sdk/util-user-agent-browser`, so no net-new package). Fix the stale `UAParser().device.type` comment in `apps/web/src/routes/_authenticated/projects/$projectSlug/settings/account.tsx`. Land as its own small PR off `development` (code change, not docs).

**Exit gate**: a written, reviewed dependency matrix and an agreed self-host profile; the required-vs-optional split (and the documented AI requirement) is finalized; and the shipped app's only AGPL dependency (`ua-parser-js`) is replaced by MIT `bowser` (P1-6).

### Phase 2 — Tier 1: Local / development experience

Polish and document the path contributors already use; make it key-free.

- [ ] **P2-1**: Verify and document the **infra-only Compose + `pnpm dev` / `.tmuxinator.yml`** workflow end-to-end (hot reload across all five services).
- [ ] **P2-2**: One-command local bootstrap (`make dev` / `pnpm setup`) that brings up infra, migrates, seeds, and starts services — reproducible from a clean clone.
- [ ] **P2-3**: Ensure the **full test suite runs with no proprietary keys**; gate this in CI so regressions are caught.
- [ ] **P2-4**: Clarify optional dev tooling (e.g. `op-gepa` Python venv) so its absence never blocks a contributor.
- [ ] **P2-5**: Refresh `CONTRIBUTING.md` + a Tier-1 page in the self-hosting guide with a "first run / first contribution in N minutes" path.

**Exit gate**: a new contributor can clone, start everything with hot reload, and run the whole test suite green without any third-party account or key.

### Phase 3 — Tier 2: Single-host production (Docker Compose) — *priority deliverable*

The headline "easy self-hosting" path: one machine, published images, one `.env`, full stack.

- [ ] **P3-1**: Publish **public, versioned, multi-arch container images** for all five app services (pending P1-4) so self-hosters pull instead of build.
- [ ] **P3-2**: Author a full-stack self-host compose (e.g. `docker-compose.selfhost.yml` or a compose profile) running **all app services + infra** with production-grade defaults.
- [ ] **P3-3**: Bundle **SeaweedFS** (Apache-2.0) as the self-host object store — a single-container all-in-one S3 service (`server -s3`) wired behind the `s3` driver (`LAT_STORAGE_DRIVER=s3` + `LAT_STORAGE_S3_ENDPOINT`). Document the three options (`fs` on a shared volume / bundled SeaweedFS / bring-your-own managed S3) and the **all-services-share-storage** constraint (ingest writes payloads that workers read; exports are written by workers and served by web). Ship a **`.env.selfhost.example`** pre-wired to the self-host profile with secrets-generation guidance and AI keys called out.
- [ ] **P3-4**: Ensure **graceful degradation** with no proprietary AI keys — the app boots and core observability (ingest + trace viewing) works; AI-dependent features are cleanly disabled with a clear message instead of crashing.
- [ ] **P3-5**: Quarantine/remove dead `@platform/db-weaviate` (pending P1-4) and any other dead infra packages.
- [ ] **P3-6**: Verify one-command bring-up from a clean machine (migrations + seed run automatically; clear health checks).
- [ ] **P3-7**: **Self-hosting guide — Tier 2**: requirements, quick start, full **env reference** (required vs optional vs proprietary-enhancement), the documented AI requirement, backups/upgrades, and a **"Self-host"** section added to `README.md`.

**Exit gate**: `docker compose -f <selfhost compose> up` on a clean machine yields a working Latitude — core observability with zero proprietary keys, full features when the documented AI keys are supplied — and a stranger can reproduce it from the docs alone.

### Phase 4 — Tier 3: Cluster / Cloud production (advanced, Helm-only)

Scalable, HA deployment via a cloud-agnostic Helm chart on the same images. **`infra/` is not touched.**

- [ ] **P4-1**: Author a **Helm chart** (+ raw manifests) under e.g. `deploy/helm/` for all five services (`web`, `api`, `ingest`, `workers`, `workflows`) with a Deployment + Service each, ingress, HPA-ready resource requests, PVCs, secrets, and a migration job; `values.yaml` pre-wired to the self-host profile.
- [ ] **P4-2**: Decide and implement the **Temporal** story for the chart (bundled self-hosted Temporal subchart vs. external Temporal the operator points at) — see open questions.
- [ ] **P4-3**: **Object storage:** ship **SeaweedFS** (Apache-2.0) via its official Helm chart (standalone → distributed/erasure-coded) as the bundled default, with bring-your-own managed S3 documented (both behind the `s3` driver). For the other stateful deps (Postgres/ClickHouse/Redis), decide bundled subcharts (turnkey) vs. bring-your-own managed services, with both documented.
- [ ] **P4-4**: Document operations for Tier 3: scaling each service, persistence/backups, secrets management, upgrades/migrations, and health/observability.
- [ ] **P4-5**: Smoke-test `helm install` against a real cluster (managed k8s); **self-hosting guide — Tier 3** page.

**Exit gate**: a third party can deploy a scalable Latitude via `helm install`, following the docs, on any conformant cluster — with no Latitude-account-specific assumptions and no changes to `infra/`.

### Phase 5 — Pluggable / OSS AI providers (polish — removes the proprietary-AI requirement)

The core of "no hard non-OSS AI deps." Make every internal AI capability runnable on open models, then revisit the tier docs.

- [ ] **P5-1**: Add an **OSS/self-hostable embeddings adapter** behind the existing `AIEmbed` port (OpenAI-compatible embeddings → Ollama, vLLM, LM Studio, HF text-embeddings-inference). Make the embeddings provider + model **env-selectable**; Voyage becomes one option, not the only one.
- [ ] **P5-2**: Make **reranking** work without a proprietary reranker — an OSS reranker adapter behind `AIRerank` or a documented **no-rerank fallback** so search still functions (degraded, not broken).
- [ ] **P5-3**: Make the **internal LLM provider** (flaggers, evals, conversation intelligence, issue summarization, AI generation, annotator optimizations) selectable to any **OpenAI-compatible endpoint**; keep Bedrock/Anthropic as optional providers.
- [ ] **P5-4**: Tests for each new adapter + a fully-OSS-profile integration path that requires no proprietary key.
- [ ] **P5-5**: Resolve the **embedding-dimension migration** problem (switching embedding models against existing pgvector data).
- [ ] **P5-6**: **Update the self-hosting docs and profile across all tiers** to make fully-OSS models the documented default; downgrade proprietary providers to optional enhancements.

**Exit gate**: with zero proprietary AI keys set, Latitude runs search, issues, and evals end-to-end on open models; proprietary providers still work when configured; docs reflect the fully-OSS profile.

### Phase 6 — One-click / templated deploys (nice to have, lowest priority)

Convenience layer on top of Tier 2; pursued only after Tiers 1–3 are solid.

- [ ] **P6-1**: **Railway** template (one-click deploy).
- [ ] **P6-2**: **Coolify** template.
- [ ] **P6-3**: **Render** blueprint; **evaluate Vercel** feasibility (likely web-only) and document the verdict.
- [ ] **P6-4**: A deploy-targets matrix in the docs (what each template provisions, trade-offs).

**Exit gate**: at least one one-click template deploys a working Latitude; each shipped template is documented and smoke-tested.

## Open questions / decisions pending

- **Tier naming**: finalize names for Tier 2 ("Single-host") and Tier 3 ("Cluster / Cloud") — current names are provisional.
- **Self-host limits**: are billing/Stripe-gated limits simply disabled in self-host, or replaced with config-driven limits?
- **Graceful degradation surface**: exactly how do AI-dependent features present when their provider is unconfigured (hidden, disabled with a tooltip, empty state)?
- **Image distribution**: which registry and tagging scheme for public images (GHCR? Docker Hub? both?), and how versions track releases.
- **Temporal in the Helm chart (P4-2)**: bundle self-hosted Temporal as a chart dependency/subchart for a turnkey install, or require an external Temporal (self-hosted or Temporal Cloud) the operator points at?
- **Stateful deps in the Helm chart (P4-3)**: bundle Postgres/ClickHouse/Redis subcharts (turnkey but not production-ideal), or bring-your-own managed services (recommended for real prod)? *(Object storage is **decided**: bundled **SeaweedFS** + BYO managed S3.)*
- **(Phase 5) Embeddings default**: which OSS embedding model is the blessed default, and how do we handle the **dimension/migration** implications of switching embedding models against existing pgvector data?
- **(Phase 5) Reranking**: ship an OSS reranker adapter, or make search rerank-optional by default?
- **(Phase 5) Internal LLM default**: do we bundle/recommend a specific local model (e.g. via Ollama) as the OSS default, and what's the minimum hardware guidance?

> More context and instructions from the user will be folded into this spec incrementally.

## Appendix A — Dependency license & self-hosting audit

**Scope.** Every shipped/required dependency of the product: infra services (the things you run — Postgres, ClickHouse, Redis, Temporal, object storage), the AI providers/models we call, and the application libraries (TypeScript **and** Python). It deliberately **excludes** the `infra/` Pulumi folder (that is Latitude's own cloud deployment, not a self-hoster's dependency).

**Method.** Ground-truth, not memory: JS licenses from `pnpm licenses list --json` over the fully installed tree (~1,900 unique package@version entries, direct + transitive, all platforms); Python from each `pyproject.toml` + installed `dist-info/METADATA`; infra images resolved to their actual running versions and license; AI from declared SDK deps + each provider's service terms. Audited **2026-06-09**.

> **A note on the question that matters most — "does any license prohibit self-deploying Latitude?"**
> **No.** No dependency license prohibits deploying Latitude yourself, at any scale, for hobby **or** commercial/business use. The few non-permissive items below are either (a) external services where the restrictive clause only triggers if *you resell that service itself* (Redis, MinIO), (b) dev-only and stripped from the shipped build (agentation), or (c) copyleft that Latitude already satisfies by being public MIT source (ua-parser-js, libvips). The actionable items are about keeping the stack *cleanly* OSS, not about legality of self-hosting.

### Bottom line — the only non-permissive findings

| # | Dependency | License | Ships in product? | Prohibits self-deploy (hobby/business)? | Recommended action |
| - | --- | --- | --- | --- | --- |
| 1 | **Redis** (`redis:7` → 7.4.9) | RSALv2 / SSPLv1 (dual, source-available, **non-OSS**) | Run as a service (cache + BullMQ) | **No** — RSAL/SSPL only restrict offering *Redis itself* as a managed service; internal use inside Latitude is unrestricted | **Kept as-is (decided).** Document the rationale; Valkey / `redis:7.2` remain optional fully-OSS drop-ins for stricter operators |
| 2 | **ua-parser-js@2.0.9** | AGPL-3.0-or-later (commercial license also sold) | **Yes** — runtime dep in `apps/web` (server-side UA parsing for backoffice/sessions) | **No** — but it is the only copyleft in the shipped app; AGPL's source-offer duty is already met since Latitude is public MIT source | Pin **ua-parser-js v1 (MIT)** or swap for an MIT UA parser to keep the app copyleft-free |
| 3 | **MinIO** — *not a dependency* | AGPL-3.0 | **No — not in the repo** | **No** | **Decided: not used.** Tier 1 = `fs`; Tier 2/3 bundle **SeaweedFS** (Apache-2.0); BYO any S3-compatible / managed S3. No AGPL introduced |
| 4 | **agentation@3.0.2** | PolyForm-Shield-1.0.0 (source-available, **non-OSS**) | **No** — `devDependency`, dev-gated by `import.meta.env.DEV`, dead-code-eliminated from prod | **No** — never shipped (and Shield only restricts building a competitor anyway) | Keep dev-only |
| 5 | **@img/sharp-libvips-\*@1.2.4** (libvips prebuilt, via `sharp`) | LGPL-3.0-or-later | Yes (transitive, platform binary) | **No** — LGPL dynamically-linked prebuilt, unmodified; permits commercial use | None |

Everything else is permissive or attribution-only — see the distribution and per-area tables below.

### Infrastructure / external services (the things you run)

| Service | Image / source (compose) | License | Self-host / on-prem restriction | Notes |
| --- | --- | --- | --- | --- |
| PostgreSQL + pgvector | `pgvector/pgvector:pg16` | PostgreSQL License (both) | **None** | Primary OLTP store; permissive BSD-style |
| ClickHouse | `clickhouse/clickhouse-server:26.2` | Apache-2.0 | **None** | Span/telemetry OLAP store |
| Redis (cache + BullMQ) | `redis:7` → **7.4.9** | **RSALv2 / SSPLv1** (source-available) | **None for internal use**; SSPL/RSAL trigger only on reselling Redis-as-a-service | Non-OSS license, but internal use is unrestricted → **kept as-is**. Valkey / `redis:7.2` optional for stricter operators |
| Temporal (server) | `temporalio/auto-setup:1.27.2` | MIT | **None** | Self-hostable; Temporal Cloud is optional |
| Temporal UI | `temporalio/ui:2.36.0` | MIT | **None** | |
| Mailpit (local SMTP) | `axllent/mailpit:v1.24` | MIT | **None** | Dev only |
| Object storage | `fs` driver (Tier 1) or **SeaweedFS** (Tier 2/3); S3 via `@aws-sdk/client-s3` (Apache-2.0) to **any** S3-compatible backend | Apache-2.0 (client + SeaweedFS) | **None** | Self-host store **decided: SeaweedFS** (Apache-2.0) or BYO managed S3. **MinIO (AGPL) not used.** RustFS (Apache-2.0) a revisit-at-GA candidate |

No MongoDB, Elasticsearch, or other SSPL/Elastic/BSL-licensed datastore is used. The default app object-storage driver is `fs`; the S3 client is `@aws-sdk/client-s3` (Apache-2.0), which speaks to any S3-compatible backend.

### AI providers & models

The model-provider **client SDKs are all OSS** (Apache-2.0 / MIT). The **default internal providers are proprietary, paid, not self-hostable** services — a *functional* limitation (addressed in Phase 5), **not a license that forbids self-hosting or commercial use**.

| Provider / model | Used for | Client SDK (license) | Service terms | Self-hostable model? | Restriction on self-deploying Latitude |
| --- | --- | --- | --- | --- | --- |
| **Voyage AI** (embeddings + rerank) | semantic search, highlights, issue clustering | `voyageai` (MIT) | Proprietary paid API | No | None legal; needs API key — **hard functional dep today** (Phase 5 adds OSS option) |
| **Anthropic** (Claude) | flaggers, annotator optimization, AI flows | `@anthropic-ai/sdk` (MIT), `@ai-sdk/anthropic` (Apache-2.0) | Proprietary commercial API ToS | No | None legal; needs account + key |
| **Amazon Bedrock** | internal AI flows | `@ai-sdk/amazon-bedrock`, `@aws-sdk/client-bedrock-runtime` (Apache-2.0) | Proprietary AWS service + per-model EULAs | No | None legal; needs AWS account |
| **OpenAI / Cohere** (provider options) | model provider options; OpenAI-compatible endpoints | `openai` (Apache-2.0), `cohere-ai` (MIT), `@ai-sdk/openai` (Apache-2.0) | Proprietary APIs — **but `openai` also targets any OpenAI-compatible server** (Ollama, vLLM, LM Studio) | Endpoint-dependent | None — this SDK is the **Phase-5 enabler** for fully-OSS local models |
| Vercel AI SDK core | provider abstraction | `ai`, `@ai-sdk/provider` (Apache-2.0) | n/a (library) | n/a | None |

### Application libraries — TypeScript

Installed-tree license distribution (direct + transitive, all platforms; ~1,900 unique entries):

| License | Count (approx.) | Class |
| --- | --- | --- |
| MIT (+ `mit`, MIT-0) | ~1,114 | Permissive |
| Apache-2.0 | 297 | Permissive |
| ISC | 92 | Permissive |
| BSD-3-Clause / BSD-2-Clause | 24 / 23 | Permissive |
| MPL-2.0 | 6 | Weak copyleft (file-level) — no use restriction |
| CC0-1.0 / Unlicense / 0BSD / WTFPL / Zlib / Python-2.0 (PSF) | ~10 total | Permissive / public-domain-equivalent |
| CC-BY-3.0 / CC-BY-4.0 | 2 | Attribution-only data (`spdx-exceptions`, `caniuse-lite`) |
| **AGPL-3.0-or-later** | **1** | `ua-parser-js` — see finding #2 |
| **PolyForm-Shield-1.0.0** | **1** | `agentation` (dev-only) — see finding #4 |
| **LGPL-3.0-or-later** | **1** | `@img/sharp-libvips-*` — see finding #5 |

Core chosen runtime libraries — all permissive: Hono (MIT), TanStack Router/Start + React (MIT), Better Auth (MIT), Drizzle ORM (Apache-2.0) / drizzle-kit (MIT) / `pg` (MIT), `@clickhouse/client` (Apache-2.0), ioredis (MIT), **BullMQ (MIT)**, nodemailer (MIT-0), `@slack/web-api` (MIT), posthog-node (MIT), Effect (MIT), Zod (MIT). Toolchain: Vite (MIT), Turbo (MIT), Vitest (MIT), Biome (MIT/Apache-2.0), TypeScript (Apache-2.0). The 6 MPL-2.0 packages (`satori`, `@resvg/resvg-js`, `lightningcss`, `dompurify` [MPL **or** Apache-2.0]) are weak file-level copyleft with **no restriction** on use, self-hosting, or commercial deployment.

### Application libraries — Python

| Project | Role | Dependency license summary | Restriction |
| --- | --- | --- | --- |
| `packages/telemetry/python` (`latitude-telemetry`, MIT) | Published client tracing SDK (instruments the *user's* app; **not** part of the self-hosted server) | OpenTelemetry SDK/exporters (Apache-2.0); OpenLLMetry `opentelemetry-instrumentation-*` (Apache-2.0); Arize OpenInference `openinference-*` (Apache-2.0); `pydantic` (MIT); `typing-extensions` (PSF/Python-2.0); `openai-agents` (MIT) | **None** — all permissive |
| `packages/platform/op-gepa/python` (`latitude-op-gepa`) | Optional internal prompt-optimizer runtime | `gepa` (MIT), `pydantic` (MIT), `typing-extensions` (PSF) | **None** — optional; all permissive |

### Recommendations (feed Phase 1 → Phase 3)

1. **Keep Redis as-is — decided.** Latitude uses Redis only internally (cache + BullMQ) and does not resell it as a service, so RSALv2/SSPLv1 impose no restriction on self-hosting at any scale. Document this rationale in the self-hosting guide. Valkey / `redis:7.2` (BSD-3) stay available as fully-OSS drop-ins for operators whose policy forbids source-available licenses, but Latitude does not switch.
2. **Drop the AGPL from the shipped app (decided — scheduled as P1-6)**: replace `ua-parser-js@2.0.9` with **`bowser@2.14.1`** (MIT, already in the lockfile via `@aws-sdk/util-user-agent-browser`). Usage is trivial (cosmetic User-Agent → browser/OS/device labels in two server functions). **Not required for legal self-hosting** — AGPL permits private/commercial self-hosting and Latitude's public source already satisfies it — but it makes the deployed app 100% permissive and removes the one copyleft obligation. See **P1-6** for the exact where/how.
3. **Object store — decided: SeaweedFS (Apache-2.0).** The storage port is already provider-agnostic (default `fs`, or any S3-compatible endpoint), so no new abstraction is needed. Tier 1 stays on `fs`; **Tier 2 bundles SeaweedFS as a single container, Tier 3 via its official Helm chart** (standalone → distributed); bring-your-own managed S3 is documented for both. **MinIO (AGPL) is not used.** RustFS (Apache-2.0) is the most promising future drop-in but is currently beta — revisit as the bundled default once it reaches a stable GA.
4. **Keep `agentation` dev-only** (already dead-code-eliminated) — no change needed, but note it so it is never promoted to a runtime dependency.
5. **`@img/sharp-libvips` (LGPL) — no action.** Dynamically-linked, unmodified prebuilt; permits commercial/self-host use.
6. Treat the proprietary **AI providers as a functional (not legal) limitation** — already tracked as the Phase 5 polish.
