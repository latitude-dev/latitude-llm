# OSS-friendly & self-hostable Latitude

> **Documentation**: `dev-docs/deployment.md`, `dev-docs/network-diagram.md`, `infra/README.md`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `.env.example`, `docker-compose.yml`, `.tmuxinator.yml` — and two new `docs/` (Mintlify) areas created across Phases 3–5: a **Development** entry (Tier 1: local dev + contribution guidelines) and a **Deployment** group (Tier 2 **Single-host**, Tier 3 **Cluster**).

This spec tracks the initiative to make the Latitude product — and therefore this repository — the most **OSS-friendly and self-host-ready** it can be. It is a living document: high-level context, goals, and milestones are captured here so they aren't lost, and detail will be filled in as more information and decisions arrive.

> **This spec is temporary.** As each phase stabilizes it must **promote its durable knowledge** out of here and into the permanent knowledge bases — `dev-docs/*.md` (architecture/design), the `docs/` Mintlify site (user-facing Development & Deployment guides), and `AGENTS.md` (repo-wide rules). **Phase 8** consolidates anything outstanding and **deletes this file** — nothing here should be lost when `specs/oss.md` is removed.

## Strategy & sequencing

The fastest path to value is a **great self-hosting experience and documentation first**, even with current limitations — most notably that **AI-dependent features still require proprietary providers** (Voyage AI for embeddings/reranking; Amazon Bedrock / Anthropic for internal LLM flows). We **accept and clearly document** that requirement in the near term rather than letting it block shipping a usable self-host.

We then **polish**: add OSS/pluggable AI providers so the stack can run on fully open models, and **update the self-hosting docs** accordingly once that lands.

**House-cleaning comes first.** Right after the audit and **before any self-hosting/docs work**, a short cleanup pass (Phase 2) strips the AGPL `ua-parser-js` dependency, removes dead code (e.g. `db-weaviate`), de-bakes the `web` client's build-time deployment URLs (so one public image serves any domain), and lands the small audit-driven fixes (e.g. Redis key-namespacing for shared instances) so everything is built on a clean, fully-permissive base.

**Documentation ships *with* each tier, not after.** Each self-hosting tier below lands together with the docs that make it usable — docs are part of the deliverable, not a follow-up.

Finally, **promote all durable knowledge into `dev-docs/` / `docs/` / `AGENTS.md` and delete this spec** (Phase 8).

## Self-hosting tiers

We define **three tiers** of running Latitude, increasing in operational complexity and in production-readiness. Each is a first-class, documented path.

**Docs structure:** in the `docs/` (Mintlify) site, **Tier 1 lives under a "Development" entry** (local setup + how to contribute) and **Tiers 2–3 live under a "Deployment" group** with **"Single-host"** and **"Cluster"** subentries — keeping "run it to hack on it" cleanly separate from "deploy it for real."

### Tier 1 — Local (Development)

For contributors and people evaluating Latitude on their machine. **Infra-only Docker Compose** (Postgres, ClickHouse, Redis, Mailpit, Temporal) with the **Latitude services run directly by the developer** for hot reload and good DevEx — `pnpm dev` (Turbo) or the existing **`.tmuxinator.yml`** layout that already starts infra + `api`/`ingest`/`web`/`workers`/`workflows` + pg studio in panes. Optimized for **fast iteration**, not durability. **Object storage:** the local **`fs`** driver (a mounted directory) — no object store to run. **Artifacts:** `docker-compose.yml` (infra-only), `.env.development`, `.tmuxinator.yml` / `pnpm --filter <pkg> dev`.

### Tier 2 — Single-host (Production simple)

A simple, straightforward way to run a **production-grade Latitude instance on a single machine** entirely via Docker Compose: all **application services** (`web`, `api`, `ingest`, `workers`, `workflows`) **plus** infra, using **published container images** (no build step), sane production defaults, and one `.env`. This is the **headline near-term deliverable** for "easy self-hosting." **Object storage:** bundles **SeaweedFS** (Apache-2.0) as a single-container all-in-one S3 service behind the existing `s3` driver — or point at any S3-compatible / managed store (`fs` on a shared volume also works on a single host). One-click PaaS templates (Phase 7) are a convenience layer on top of this tier. **Artifacts:** `docker-stack.yml` (one file that runs under both `docker compose up` and `docker stack deploy`), `.env.production` (operator-created from a committed `.env.production.example`), **pulled** published images + a bundled SeaweedFS service, `s3` driver.

### Tier 3 — Cluster (Production advanced)

A little less simple but still straightforward way to deploy a **scalable, HA, production-grade Latitude** on a Kubernetes cluster — any managed k8s (EKS/GKE/AKS) or on-prem/bare-metal. Delivered as a **cloud-agnostic Helm chart** (+ raw manifests) using the same published container images and env contract: a Deployment per service (`web`, `api`, `ingest`, `workers`, `workflows`), ingress, PVCs, secrets, and a migration job. **Object storage:** **SeaweedFS** (Apache-2.0) via its official Helm chart (standalone → distributed/erasure-coded for HA), or bring your own managed S3 — both behind the same `s3` driver. **Artifacts:** `charts/latitude/` Helm chart (incl. `values.yaml`), **pulled** published images, `s3` driver.

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
- **Mostly isolatable on shared infra** (so a self-hoster can point at *existing* datastores): Postgres tables live in a dedicated **`latitude` schema** (`search_path = latitude, public`), ClickHouse in a dedicated **database** (`CLICKHOUSE_DB`), Temporal in a configurable **namespace + task queue**, object storage in a dedicated **bucket**. The gaps are **Redis-only**: the cache has **no global key prefix** (`org:…` keys, `db 0` hardcoded, no ioredis `keyPrefix`) and **BullMQ uses a non-Latitude `{bull}` prefix** — both need namespacing before Latitude can share a Redis with another app (P2-4).
- **Clean extension points already exist**: `@domain/ai` defines the `AIEmbed` / `AIRerank` ports (and the LLM provider port), so OSS AI adapters are pluggable by construction when we get to the polish phase.

### Current limitations (accepted for now, documented; lifted in Phase 6)

These are **not blockers** for shipping self-hosting — they are requirements we document plainly, then remove later:

1. **Embeddings + reranking require Voyage AI (non-OSS).**
   `@platform/ai-voyage` is currently the only adapter for the `AIEmbed`/`AIRerank` ports and **throws when `LAT_VOYAGE_API_KEY` is unset** (`"Voyage AI is unavailable: set LAT_VOYAGE_API_KEY."`). These power **semantic/trace search**, **search highlights/reranking**, and **issue clustering**. Near term: a self-hoster sets a Voyage key to enable these; without it, those specific features are unavailable (see P4-4 — the app must still boot and core observability must still work).

2. **Internal AI flows require non-OSS models.**
   Latitude's own AI features (flaggers, evaluations, conversation intelligence, issue summarization, AI generation, annotator optimizations) run on **Amazon Bedrock** (`LAT_AWS_*`) and/or **Anthropic** (`LAT_ANTHROPIC_API_KEY`). Near term: documented as a required provider for those features; not yet pluggable to a local / OpenAI-compatible endpoint.

### The gaps this initiative closes (immediate)

3. **No self-hosting story / documentation.**
   The README quick-start is entirely about the **hosted cloud** ("sign up at latitude.so"). There is **no self-hosting guide**, no documented "run your own Latitude" path, and the existing `docker-compose.yml` only provisions **infrastructure**, not the application services. The `infra/` Pulumi project documents Latitude's *own* deploy, not a third party's. **This is the priority gap.**

4. **No public, ready-to-run application container images** for self-hosters. The build mechanism already exists: one multi-stage `Dockerfile` with **6 targets** (`api`, `ingest`, `workers`, `workflows`, `web`, `migrations`) built by `build-images.yml`, pushed to GHCR on every `development` push (→ **staging** only) and on every `vX.Y.Z` release tag (→ **production**, via `scripts/release.sh`). But those images are **Latitude-deploy-specific** — named `latitude-<env>-<service>`, **sha-tagged** (not semver), and the `web` image **bakes Latitude's own `VITE_*` URLs at build time** — so they are *not* reusable by third parties. A public, env-neutral, version-tagged image set is the missing piece (P4-1).

5. **No one-click / templated deploys.** No Helm chart, generalized IaC, or Railway/Render/Coolify templates exist for third parties.

6. **Dead code to clean up.** `@platform/db-weaviate` is unused (no consumers; the `weaviate` client isn't even installed; only a stale `tsconfig.tsbuildinfo` remains — vector storage moved to pgvector). Removed in Phase 2 (P2-2), along with anything else knip surfaces.

## Goals

1. **Easy self-hosting experience across three tiers** — simple, clear, fast instructions and documentation for Local, Single-host, and Cluster/Cloud. **(Priority)**
2. **Easy development experience (Tier 1)** — trivial to spin up locally with hot reload, run the full test suite **without any proprietary keys**, and contribute.
3. **No hard dependencies on non-OSS / non-self-hostable third parties** — for infra, libraries, **or AI models**. Every feature must eventually be runnable on a fully open stack; proprietary providers may remain as *optional, higher-quality* alternatives. **(Polish — Phase 6; the AI-model part is the remaining piece.)**
4. **(Nice to have, lowest priority) One-click templates** — Railway / Coolify / Render (and evaluate Vercel) so people can deploy in minutes.

### Guiding principles

- **Ship usable self-host first; perfect it after.** Document current proprietary-AI requirements clearly instead of blocking on removing them.
- **One image set, three tiers.** Tiers 2 and 3 deploy the **same published container images** with the same env contract — only orchestration differs.
- **Ports stay; adapters multiply.** Don't rip out proprietary providers — add OSS adapters behind the same ports and make the provider **selectable via env**, with an OSS default for the self-host profile (Phase 6).
- **Graceful degradation, never a crash.** When an optional capability has no provider configured, the feature degrades with a clear message; it must not throw at startup or break unrelated flows. The app must boot and serve core observability with **no proprietary AI keys** set.
- **A single, documented self-host profile.** One blessed configuration verified in CI; today it documents the proprietary-AI requirement, later it becomes fully OSS.
- **Self-host parity for core features.** Observability (ingest + trace viewing) works with zero proprietary keys on every tier; AI-dependent features are enabled by adding the documented providers — until Phase 6 makes open models a first-class option.

### Non-goals (for now)

- Re-architecting tenancy, RLS, or the storage model.
- Removing proprietary providers that are already optional — they stay as opt-in enhancements.
- Matching hosted-cloud model *quality* on open models — we will guarantee *functionality* (Phase 6), not identical output quality.
- **Modifying `infra/`** — Latitude's Pulumi project is critical, account-specific, and stays untouched. Tier 3 is delivered as a **separate, cloud-agnostic Helm chart**, not by generalizing `infra/`. Cloud-specific IaC (AWS/GCP/Azure) is not in scope.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 — Dependency audit & self-host profile definition

Establish the authoritative picture before changing anything; this directly feeds every tier's docs.

- [x] **P1-1**: Produce a dependency matrix covering every third-party infra component, SaaS integration, library, and AI provider/model, with licenses and self-hosting restrictions. → **see [Appendix A](#appendix-a--dependency-license--self-hosting-audit)**.
- [x] **P1-2**: Audit `.env.example` and tag every var as **required**, **optional**, or **proprietary-enhancement**; identify the minimal var set per tier (and which AI keys unlock which features). → **see [Appendix B](#appendix-b--environment-variable-matrix-p1-2)**.
- [x] **P1-3**: Map exactly which features break without Voyage / Bedrock / Anthropic, and confirm the app still boots and core observability works without them (informs P4-4). **Result — key-free boot confirmed.** All three adapters resolve credentials **lazily at call time**, never at layer-construction or startup: `@platform/ai-voyage` `AIEmbedLive`/`AIRerankLive` are `Layer.succeed` whose `embed`/`rerank` read `LAT_VOYAGE_API_KEY` only when invoked; `@platform/ai-vercel` `AIGenerateLive` is `Layer.effect` whose build only defines `generate`, with Bedrock/Anthropic credentials read inside the call. No app's `clients.ts`/`server.ts` wires an AI adapter at boot, and the **trace-ingest path touches no AI** (`apps/ingest` → `ingestSpansUseCase` is decode → sample → enqueue, zero embed/rerank/LLM). So every service boots and core observability (ingest + trace viewing) works with **no proprietary AI keys**; AI features fail per-call with a clear message and search degrades to lexical. → **full map in [Appendix C](#appendix-c--feature-degradation-without-proprietary-ai-p1-3)**.
- [x] **P1-4**: Confirm `@platform/db-weaviate` is dead and list anything else removable (feeds Phase 2); confirm GHCR image visibility / publishing story. **Result:** `db-weaviate` is dead, **and four more stale leftover dirs match the same pattern** — `packages/platform/events-outbox`, `packages/domain/auth`, `packages/domain/subscriptions`, `packages/domain/onboarding` each hold **only** a `.tsbuildinfo` (no `package.json`/`src`), with **zero importers** and no `package.json` anywhere declaring those names. All five are removed in **P2-2**. **Image story:** the single multi-stage `Dockerfile` carries the 6 expected targets; `build-images.yml` (called by `deploy.yml`) pushes to **`ghcr.io/latitude-dev`** as **`latitude-<env>-<service>`** (`<env>` ∈ staging/production), tagged **`sha-<8>` + `:latest`** (not semver), **single-arch** (no buildx `platforms:`), on `development` push (→ staging) and `vX.Y.Z` tag (→ production). The **`web` target bakes six `VITE_*` build-args** (`Dockerfile` `ARG VITE_…` + workflow `--build-arg`), so today's images are deploy-specific — exactly the rename + runtime-config work **P4-1** owns. GHCR package visibility is GitHub-default (private) until P4-1 publishes the public env-neutral set.
- [x] **P1-5**: Write down the canonical **self-host profile** (which adapters/images constitute it, and the current proprietary-AI requirement). → **see [Appendix D](#appendix-d--canonical-self-host-profile-p1-5)**.
- [x] **P1-6**: **Audit shared-infra coexistence** — can a self-hoster point Latitude at *existing* Postgres/ClickHouse/Redis/object-store/Temporal? Result: **4/6 are dedicated-namespace isolatable** — Postgres (`latitude` schema), ClickHouse (`CLICKHOUSE_DB` database), Temporal (`LAT_TEMPORAL_NAMESPACE` + task queue), object storage (dedicated `LAT_STORAGE_S3_BUCKET`). Postgres notes: the target DB needs the `vector` (pgvector) extension and an admin role with schema-create. **Two Redis gaps remain → P2-4 (Phase 2).**

**Exit gate**: a written, reviewed dependency matrix and an agreed self-host profile; the required-vs-optional split (and the documented AI requirement) is finalized; and shared-infra coexistence is audited (P1-6) — the Redis-namespacing fix it surfaced lands in Phase 2 (P2-4).

### Phase 2 — House-cleaning & foundational fixes (before any self-host/doc work)

Strip cruft and land the small audit-driven code fixes so every later phase builds on a clean, fully-permissive, coexistence-ready base. Small, self-contained PRs.

- [ ] **P2-1**: **Swap `ua-parser-js@2.0.9` (AGPL-3.0) → `bowser@2.14.1` (MIT)** to make the shipped web app fully permissive (the audit's one shipped copyleft dep — see Appendix A, finding #2). It's used **server-side only**, for cosmetic User-Agent → browser/OS/device labels, in two files: `apps/web/src/domains/admin/users.functions.ts` and `apps/web/src/domains/sessions/user-sessions.functions.ts`. Per file it's two edits — swap the import (`import { UAParser } from "ua-parser-js"` → `import Bowser from "bowser"`), call `Bowser.parse(ua)` instead of `UAParser(ua)`, and change `parsed?.device.type` → `parsed?.platform.type` (`browser.name` / `os.name` map unchanged; `platform.type ∈ {desktop, mobile, tablet, tv}` so the `?? "desktop"` fallback still holds). Remove `ua-parser-js` from / add `bowser` to `apps/web/package.json` (bowser is **already in the lockfile** via `@aws-sdk/util-user-agent-browser`, so no net-new package). Fix the stale `UAParser().device.type` comment in `apps/web/src/routes/_authenticated/projects/$projectSlug/settings/account.tsx`. Land as its own small PR off `development`.
- [ ] **P2-2**: **Remove the dead `@platform/db-weaviate` package and the other stale leftover package dirs** — the P1-4 audit confirmed **five** directories that hold **only** a stale `.tsbuildinfo` (no `package.json`/`src`), with zero importers and no `package.json` declaring their names: `packages/platform/db-weaviate`, `packages/platform/events-outbox`, `packages/domain/auth`, `packages/domain/subscriptions`, `packages/domain/onboarding`. (`db-weaviate`'s `weaviate` npm client isn't even installed; vector storage moved to pgvector.) Delete all five directories and any lingering workspace / tsconfig references.
- [ ] **P2-3**: **Sweep for other dead code with `knip`** (`knip.json` is already configured) — prune genuinely-unused files, exports, and dependencies it surfaces (respecting the existing entry/ignore config), plus any orphaned `LAT_*` env vars / `.env.example` drift. Triage, don't blindly delete; skip intentional entry points.
- [ ] **P2-4**: **Namespace Latitude on a shared Redis** (so it can coexist with other apps without key collisions) — the fix surfaced by the P1-6 coexistence audit. Add a configurable **global cache key prefix** (ioredis `keyPrefix`, e.g. `LAT_REDIS_KEY_PREFIX=latitude:`) and/or a selectable **`db` index** (today `db 0` is hardcoded and keys are only `org:…`-scoped); and make the **BullMQ prefix Latitude-namespaced/configurable** (today a fixed `{bull}`). Prerequisite for "bring-your-own Redis" in Tier 2/3 (P4-2, P5-4).
- [ ] **P2-5**: **De-bake the `web` client's deployment URLs (make the public image URL-neutral)** — a foundational fix that de-risks P4-1, surfaced by the P1-4 image audit. Today the `web` target bakes two deployment-specific URLs into the JS bundle at build time; remove that bake so one public image serves any domain. **Principle (promote to `AGENTS.md` in Phase 8):** frontend URL constants use **relative paths**; any absolute URL needed server-side is injected from a **runtime `LAT_*` env var**, never a build-time `VITE_*` bake.
  - **Delete `VITE_LAT_API_URL` entirely** — it has **zero `import.meta.env` readers** (the web app calls the API via same-origin TanStack server-function RPC). Remove from `Dockerfile` (`ARG`), `turbo.json` (web build `env`), `.env.example`, `.github/workflows/build-images.yml` + `deploy.yml` (build env), and `infra/lib/ecs.ts` (where it's set as a **runtime** container env — a no-op, since `VITE_*` binds only at build).
  - **Remove `VITE_LAT_WEB_URL` from the client bundle** — its one client read (`apps/web/src/lib/auth-config.ts` → `WEB_BASE_URL`) feeds three consumers, each fixed per the principle: (1) `auth-client.ts` — **drop `baseURL`**; Better Auth's client resolves `window.location.origin` in the browser and a relative `/api/auth` under SSR (verified in `better-auth/dist/utils/url.mjs` `getBaseURL`). (2) `routes/login.tsx` — OAuth start becomes a **relative path** `/api/auth/${provider}/start?…` (`window.location.assign`, same-origin). (3) `routes/wrapped/$id.tsx` `og:image` (needs an **absolute** URL for crawlers, emitted in the SSR `head()`) — source the base from **runtime `LAT_WEB_URL`** via the existing server-fn loader (`getWrappedPageData`), threaded through `loaderData`. Then `auth-config.ts` drops `WEB_BASE_URL` (keeps `AUTH_BASE_PATH` + `TURNSTILE_SITE_KEY`). Remove the build-time `VITE_LAT_WEB_URL` from `Dockerfile`/`turbo.json`/`.env.example`/`build-images.yml`/`deploy.yml` build env + the no-op `infra/lib/ecs.ts` line.
  - **Rename the one legitimate remaining use** — `deploy.yml`'s Datadog source-map `--minified-path-prefix "${{ vars.VITE_LAT_WEB_URL }}"` is no longer about the build; rename the GitHub Actions repo variable + reference to a `DD_*` name (e.g. `DD_SOURCEMAP_URL_PREFIX`) to decouple it from the deleted `VITE_*` concept.
  - **Leave the four optional `VITE_*`** (`VITE_LAT_TURNSTILE_SITE_KEY`, `VITE_LAT_POSTHOG_KEY`, `VITE_LAT_POSTHOG_HOST`, `VITE_LAT_GTM_CONTAINER_ID`) **as-is** — kept for Latitude-cloud builds; **simply unset on public images** ⇒ not baked ⇒ those features no-op. Net result: the public `web` image bakes **no** deployment-specific URL.
  - **Caveat:** the `deploy.yml` build-env + Datadog rename touch the **production deploy pipeline** (and a GitHub repo-variable rename), and the `infra/lib/ecs.ts` lines touch `infra/` (normally untouched) — these are dead/no-op cleanup only, but coordinate before landing.

**Exit gate**: the shipped application is **100% permissive** (no AGPL — `ua-parser-js` replaced by `bowser`); no dead infra packages remain (`db-weaviate` gone); knip is clean or its remaining reports are explicitly triaged; Latitude is **namespaced for shared-Redis coexistence** (P2-4); and the public `web` bundle **bakes no deployment URLs** (P2-5). Done before Phase 3 starts.

### Phase 3 — Tier 1: Local (Development) experience

Polish and document the path contributors already use; make it key-free.

- [ ] **P3-1**: Verify and document the **infra-only Compose + `pnpm dev` / `.tmuxinator.yml`** workflow end-to-end (hot reload across all five services).
- [ ] **P3-2**: One-command local bootstrap (`make dev` / `pnpm setup`) that brings up infra, migrates, seeds, and starts services — reproducible from a clean clone.
- [ ] **P3-3**: Ensure the **full test suite runs with no proprietary keys**; gate this in CI so regressions are caught.
- [ ] **P3-4**: Clarify optional dev tooling (e.g. `op-gepa` Python venv) so its absence never blocks a contributor.
- [ ] **P3-5**: Create the **"Development"** docs entry in `docs/` (a `docs.json` group, **separate from Deployment**) covering (a) the Tier-1 local-dev flow (infra Compose + `pnpm dev` / `.tmuxinator.yml`, "first run in N minutes") and (b) **contribution guidelines** linking to `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`; refresh `CONTRIBUTING.md` itself to match the key-free local workflow.

**Exit gate**: a new contributor can clone, start everything with hot reload, and run the whole test suite green without any third-party account or key.

### Phase 4 — Tier 2: Single-host (Production simple) — *priority deliverable*

The headline "easy self-hosting" path: one machine, published images, one `.env`, full stack.

- [ ] **P4-1**: Publish **public, env-neutral, multi-arch container images** for the **6 build targets** (`api`, `ingest`, `workers`, `workflows`, `web`, `migrations`) so Tier 2/3 **pull** instead of build — the single multi-stage `Dockerfile` stays the build recipe. **Tie tags to the release system:**
  - **Stable images from the `vX.Y.Z` release-tag flow** (`scripts/release.sh`, the only production trigger): publish `ghcr.io/latitude-dev/latitude-<service>:vX.Y.Z` (+ `:latest`). These are what Tier 2/3 pin.
  - **Edge images from `development` pushes**: publish a `:development` (edge) tag for testing pre-release builds — `development` is trunk and deploys only to **staging**, so this is never the self-host default.
  - Rename away from today's deploy-specific `latitude-<env>-<service>` / sha-tag scheme.
  - **The `web` image must not bake URLs** — **done in P2-5** (frontend URLs went relative; the one SSR-absolute case reads runtime `LAT_WEB_URL`; the baked `VITE_LAT_API_URL`/`VITE_LAT_WEB_URL` are deleted). P4-1 only needs to confirm no deployment URL is baked and that the four optional `VITE_*` stay unset on the public image — no placeholder-substitution mechanism required.
- [ ] **P4-2**: Author a full-stack self-host **`docker-stack.yml`** (one file usable with both `docker compose up` and `docker stack deploy`) running **all app services + infra + the bundled SeaweedFS + a one-shot migrations container**, with production-grade defaults and `deploy:` blocks so Swarm can scale it. Keep each infra service (Postgres/ClickHouse/Redis/SeaweedFS/Temporal) as a **clearly-marked, independently removable block** so an operator can comment it out and point the matching `LAT_*` env at an **existing instance** (bring-your-own infra). The bundled Temporal mirrors the Tier-1 dev recipe — `temporalio/auto-setup` on the bundled Postgres (Postgres for default + visibility store, no Elasticsearch).
- [ ] **P4-3**: Bundle **SeaweedFS** (Apache-2.0) as the self-host object store — a single-container all-in-one S3 service (`server -s3`) wired behind the `s3` driver (`LAT_STORAGE_DRIVER=s3` + `LAT_STORAGE_S3_ENDPOINT`). Document the three options (`fs` on a shared volume / bundled SeaweedFS / bring-your-own managed S3) and the **all-services-share-storage** constraint (ingest writes payloads that workers read; exports are written by workers and served by web). Ship a committed **`.env.production.example`** (operator copies it to `.env.production`) pre-wired to the self-host profile with secrets-generation guidance and AI keys called out.
- [ ] **P4-4**: Ensure **graceful degradation** with no proprietary AI keys — the app boots and core observability (ingest + trace viewing) works; AI-dependent features are cleanly disabled with a clear message instead of crashing.
- [ ] **P4-5**: Verify one-command bring-up from a clean machine (migrations + seed run automatically; clear health checks).
- [ ] **P4-6**: Create the **"Deployment"** docs group in `docs/` (separate from Development) with a **"Single-host"** subentry: requirements, quick start, full **env reference** (required vs optional vs proprietary-enhancement), the documented AI requirement, backups/upgrades — plus a **"Self-host"** section in `README.md` linking it.

**Exit gate**: `docker compose -f docker-stack.yml up` on a clean machine yields a working Latitude — core observability with zero proprietary keys, full features when the documented AI keys are supplied — and a stranger can reproduce it from the docs alone.

### Phase 5 — Tier 3: Cluster (Production advanced, Helm-only)

Scalable, HA deployment via a cloud-agnostic Helm chart on the same images. **`infra/` is not touched.**

- [ ] **P5-1**: Author a **Helm chart** (+ raw manifests) under **`charts/latitude/`** (incl. `values.yaml`) for all five services (`web`, `api`, `ingest`, `workers`, `workflows`) with a Deployment + Service each, ingress, HPA-ready resource requests, PVCs, secrets, and a migration job (the `migrations` image); `values.yaml` pre-wired to the self-host profile.
- [ ] **P5-2**: **Bundle a lean, Postgres-backed Temporal by default** (default *and* visibility store on Postgres — **no Elasticsearch, no Cassandra**; the same Postgres-only recipe Tier 1 dev already runs via `temporalio/auto-setup`). A single-instance Deployment is the turnkey default; the official `temporalio/helm-charts` with `cassandra.enabled=false` + `elasticsearch.enabled=false` + SQL persistence is the HA scale-up. Toggle off to point at an external Temporal / Temporal Cloud via P5-4. ES (advanced visibility) is **not** required — Latitude doesn't use it. For production cleanliness, prefer the plain server image + a one-shot schema-setup job over `auto-setup`.
- [ ] **P5-3**: **Object storage** behind the P5-4 toggle: bundled **SeaweedFS** (Apache-2.0, default) **or** external/managed S3 — both behind the `s3` driver. Same toggle pattern applies to Postgres/ClickHouse/Redis.
- [ ] **P5-4**: **Every bundled dependency is an independent on/off toggle (bring-your-own infra).** In `values.yaml`, each of Postgres, ClickHouse, Redis (cache + BullMQ), SeaweedFS, and Temporal exposes a `<dep>.enabled` flag plus an `external:` connection block; setting `enabled: false` and filling `external:` wires the right `LAT_*` env at the existing/managed instance. Bundled subcharts are the turnkey default; disabling them to point at managed services is **first-class and documented**. (Safe shared-Redis coexistence depends on **P2-4**.)
- [ ] **P5-5**: Document operations for Tier 3: scaling each service, persistence/backups, secrets management, upgrades/migrations, and health/observability.
- [ ] **P5-6**: Smoke-test `helm install` against a real cluster (managed k8s); add the **"Cluster"** subentry under the **Deployment** docs group.

**Exit gate**: a third party can deploy a scalable Latitude via `helm install`, following the docs, on any conformant cluster — with no Latitude-account-specific assumptions and no changes to `infra/` — and can **disable any bundled dependency to point at an existing/managed instance** (P5-4).

### Phase 6 — Pluggable / OSS AI providers (polish — removes the proprietary-AI requirement)

The core of "no hard non-OSS AI deps." Make every internal AI capability runnable on open models, then revisit the tier docs.

- [ ] **P6-1**: Add an **OSS/self-hostable embeddings adapter** behind the existing `AIEmbed` port (OpenAI-compatible embeddings → Ollama, vLLM, LM Studio, HF text-embeddings-inference). Make the embeddings provider + model **env-selectable**; Voyage becomes one option, not the only one.
- [ ] **P6-2**: Make **reranking** work without a proprietary reranker — an OSS reranker adapter behind `AIRerank` or a documented **no-rerank fallback** so search still functions (degraded, not broken).
- [ ] **P6-3**: Make the **internal LLM provider** (flaggers, evals, conversation intelligence, issue summarization, AI generation, annotator optimizations) selectable to any **OpenAI-compatible endpoint**; keep Bedrock/Anthropic as optional providers.
- [ ] **P6-4**: Tests for each new adapter + a fully-OSS-profile integration path that requires no proprietary key.
- [ ] **P6-5**: Resolve the **embedding-dimension migration** problem (switching embedding models against existing pgvector data).
- [ ] **P6-6**: **Update the Deployment (and Development) docs and the self-host profile across all tiers** to make fully-OSS models the documented default; downgrade proprietary providers to optional enhancements.

**Exit gate**: with zero proprietary AI keys set, Latitude runs search, issues, and evals end-to-end on open models; proprietary providers still work when configured; docs reflect the fully-OSS profile.

### Phase 7 — One-click / templated deploys (nice to have, lowest priority)

Convenience layer on top of Tier 2; pursued only after Tiers 1–3 are solid.

- [ ] **P7-1**: **Railway** template (one-click deploy).
- [ ] **P7-2**: **Coolify** template.
- [ ] **P7-3**: **Render** blueprint; **evaluate Vercel** feasibility (likely web-only) and document the verdict.
- [ ] **P7-4**: A deploy-targets matrix in the docs (what each template provisions, trade-offs).

**Exit gate**: at least one one-click template deploys a working Latitude; each shipped template is documented and smoke-tested.

### Phase 8 — Promote durable knowledge & retire the spec

Guarantees nothing is lost when `specs/oss.md` is deleted. Runs **incrementally** — promote each phase's durable knowledge as it stabilizes — and is **not gated on the optional Phase 7**; the final deletion happens once the core work (Phases 1–6) has landed and been documented.

- [ ] **P8-1**: Promote the **self-hosting architecture** into `dev-docs/` — expand `dev-docs/deployment.md` (or add a `dev-docs/self-hosting.md`) with the **three-tier model** (Local / Single-host / Cluster), the per-tier deploy artifacts, the **image build → publish → release-tag/edge-tag** flow, the **storage abstraction** (`StorageDiskPort` + flydrive, namespaces), **shared-infra coexistence + bring-your-own-infra**, and the **self-host profile**. Future-state prose, not changelog.
- [ ] **P8-2**: Promote the **dependency-license audit** (Appendix A) into a durable doc (e.g. `dev-docs/licensing.md`) so the "no license blocks self-hosting" conclusion, the per-dependency matrix, and the policy survive spec deletion.
- [ ] **P8-3**: Escalate durable **repo-wide rules into `AGENTS.md`**: shipped runtime deps must be permissive (MIT/Apache/BSD/ISC) — **no AGPL/SSPL/source-available in the application bundle**, audit new deps' licenses; **self-host object store is SeaweedFS** (never reintroduce MinIO/AGPL); infra deps must stay **isolatable + bring-your-own-able** (dedicated schema/db/namespace/bucket, namespaced Redis keys); public image **naming/tagging is tied to the release flow** (`:vX.Y.Z` stable, `:development` edge).
- [ ] **P8-4**: Confirm the user-facing `docs/` **Development** and **Deployment** areas (built in Phases 3–5) read as complete and authoritative on their own, with no dependency on this spec.
- [ ] **P8-5**: **Delete `specs/oss.md`** once P8-1…P8-4 have landed and the knowledge is confirmed durable; remove dangling references to it.

**Exit gate**: every durable decision in this spec lives in `dev-docs/`, the `docs/` site, or `AGENTS.md`; `specs/oss.md` is deleted; no doc or comment points at the removed spec.

## Open questions / decisions pending

- **Self-host limits**: are billing/Stripe-gated limits simply disabled in self-host, or replaced with config-driven limits?
- **Graceful degradation surface**: exactly how do AI-dependent features present when their provider is unconfigured (hidden, disabled with a tooltip, empty state)?
- **Image distribution (mostly decided)**: GHCR, env-neutral `latitude-<service>` images, **`vX.Y.Z` + `latest` on release tags** (stable, what self-hosters pin) and a **`development` edge tag** on trunk pushes. **Decided (P2-5):** no placeholder-substitution mechanism is needed for the `web` image — frontend URLs use relative paths and the one SSR-absolute URL reads runtime `LAT_WEB_URL`; the baked `VITE_LAT_API_URL`/`VITE_LAT_WEB_URL` are removed. Still open: whether to also mirror images to Docker Hub.
- **Stateful deps in the Helm chart — decided (P5-4):** every dependency (Postgres/ClickHouse/Redis/SeaweedFS/Temporal) is an independent `enabled` toggle — bundled subcharts by default, disable + point at existing/managed instances via an `external:` block.
- **Temporal self-host shape (minor):** `auto-setup` image (easiest — auto-creates schema on boot) vs. the plain server image + a one-shot schema-setup job (cleaner for prod); and reuse Latitude's Postgres with a dedicated `temporal` database vs. a separate Postgres. *(Bundling a Postgres-backed Temporal — no Elasticsearch/Cassandra — is **decided**; see P5-2.)*
- **(Phase 6) Embeddings default**: which OSS embedding model is the blessed default, and how do we handle the **dimension/migration** implications of switching embedding models against existing pgvector data?
- **(Phase 6) Reranking**: ship an OSS reranker adapter, or make search rerank-optional by default?
- **(Phase 6) Internal LLM default**: do we bundle/recommend a specific local model (e.g. via Ollama) as the OSS default, and what's the minimum hardware guidance?

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
| 2 | **ua-parser-js@2.0.9** | AGPL-3.0-or-later (commercial license also sold) | **Yes** — runtime dep in `apps/web` (server-side UA parsing for backoffice/sessions) | **No** — but it is the only copyleft in the shipped app; AGPL's source-offer duty is already met since Latitude is public MIT source | **Swap for `bowser@2.14.1` (MIT)** to keep the app copyleft-free — scheduled as **P2-1** |
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

The model-provider **client SDKs are all OSS** (Apache-2.0 / MIT). The **default internal providers are proprietary, paid, not self-hostable** services — a *functional* limitation (addressed in Phase 6), **not a license that forbids self-hosting or commercial use**.

| Provider / model | Used for | Client SDK (license) | Service terms | Self-hostable model? | Restriction on self-deploying Latitude |
| --- | --- | --- | --- | --- | --- |
| **Voyage AI** (embeddings + rerank) | semantic search, highlights, issue clustering | `voyageai` (MIT) | Proprietary paid API | No | None legal; needs API key — **hard functional dep today** (Phase 6 adds OSS option) |
| **Anthropic** (Claude) | flaggers, annotator optimization, AI flows | `@anthropic-ai/sdk` (MIT), `@ai-sdk/anthropic` (Apache-2.0) | Proprietary commercial API ToS | No | None legal; needs account + key |
| **Amazon Bedrock** | internal AI flows | `@ai-sdk/amazon-bedrock`, `@aws-sdk/client-bedrock-runtime` (Apache-2.0) | Proprietary AWS service + per-model EULAs | No | None legal; needs AWS account |
| **OpenAI / Cohere** (provider options) | model provider options; OpenAI-compatible endpoints | `openai` (Apache-2.0), `cohere-ai` (MIT), `@ai-sdk/openai` (Apache-2.0) | Proprietary APIs — **but `openai` also targets any OpenAI-compatible server** (Ollama, vLLM, LM Studio) | Endpoint-dependent | None — this SDK is the **Phase-6 enabler** for fully-OSS local models |
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

### Recommendations (feed Phases 1–4)

1. **Keep Redis as-is — decided.** Latitude uses Redis only internally (cache + BullMQ) and does not resell it as a service, so RSALv2/SSPLv1 impose no restriction on self-hosting at any scale. Document this rationale in the Deployment docs. Valkey / `redis:7.2` (BSD-3) stay available as fully-OSS drop-ins for operators whose policy forbids source-available licenses, but Latitude does not switch.
2. **Drop the AGPL from the shipped app (decided — scheduled as P2-1)**: replace `ua-parser-js@2.0.9` with **`bowser@2.14.1`** (MIT, already in the lockfile via `@aws-sdk/util-user-agent-browser`). Usage is trivial (cosmetic User-Agent → browser/OS/device labels in two server functions). **Not required for legal self-hosting** — AGPL permits private/commercial self-hosting and Latitude's public source already satisfies it — but it makes the deployed app 100% permissive and removes the one copyleft obligation. See **P2-1** for the exact where/how.
3. **Object store — decided: SeaweedFS (Apache-2.0).** The storage port is already provider-agnostic (default `fs`, or any S3-compatible endpoint), so no new abstraction is needed. Tier 1 stays on `fs`; **Tier 2 bundles SeaweedFS as a single container, Tier 3 via its official Helm chart** (standalone → distributed); bring-your-own managed S3 is documented for both. **MinIO (AGPL) is not used.** RustFS (Apache-2.0) is the most promising future drop-in but is currently beta — revisit as the bundled default once it reaches a stable GA.
4. **Keep `agentation` dev-only** (already dead-code-eliminated) — no change needed, but note it so it is never promoted to a runtime dependency.
5. **`@img/sharp-libvips` (LGPL) — no action.** Dynamically-linked, unmodified prebuilt; permits commercial/self-host use.
6. Treat the proprietary **AI providers as a functional (not legal) limitation** — already tracked as the Phase 6 polish.

## Appendix B — Environment variable matrix (P1-2)

Tags: **Required** (a real deploy won't function / won't boot without it), **Optional** (has a safe default or cleanly no-ops when unset), **Proprietary-enhancement** (a non-OSS provider key that unlocks an AI feature; unset = that feature degrades, never a crash — see [Appendix C](#appendix-c--feature-degradation-without-proprietary-ai-p1-3)). `VITE_*` vars are browser-facing client config currently **baked into the `web` image at build time** (P4-1 makes them runtime-injected).

### Core — Required on every tier

| Var | Notes |
| --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Bundled-Postgres container credentials. Omit if BYO Postgres (set `LAT_DATABASE_URL` instead). |
| `POSTGRES_RUNTIME_USER` / `POSTGRES_RUNTIME_PASSWORD` | RLS-bound runtime user (created by `docker/init-db.sh`). |
| `LAT_DATABASE_URL` | Runtime (RLS) connection; `latitude` schema, needs the `vector` extension. |
| `LAT_ADMIN_DATABASE_URL` | Superuser connection (migrations, seeds, cross-org runtime queries). |
| `CLICKHOUSE_URL` / `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` / `CLICKHOUSE_DB` | OLAP span store; dedicated `CLICKHOUSE_DB`. |
| `CLICKHOUSE_MIGRATION_URL` | Migration tooling (goose). |
| `LAT_REDIS_HOST` / `LAT_REDIS_PORT` | Cache Redis. |
| `LAT_BULLMQ_HOST` | Queue Redis (`LAT_BULLMQ_PORT` defaults to 6380). |
| `LAT_TEMPORAL_ADDRESS` / `LAT_TEMPORAL_NAMESPACE` / `LAT_TEMPORAL_TASK_QUEUE` | Workflow engine. |
| `LAT_STORAGE_DRIVER` (+ `LAT_STORAGE_FS_ROOT` **or** the `LAT_STORAGE_S3_*` set) | `fs` needs `LAT_STORAGE_FS_ROOT`; `s3` needs `LAT_STORAGE_S3_BUCKET`/`_REGION`/`_ACCESS_KEY_ID`/`_SECRET_ACCESS_KEY` (+ `_ENDPOINT` for non-AWS). |
| `LAT_MASTER_ENCRYPTION_KEY` | 32-byte hex (AES-256-GCM); **generate a unique value per deploy.** |
| `LAT_BETTER_AUTH_SECRET` / `LAT_BETTER_AUTH_URL` | Auth signing secret + base URL; **generate a unique secret.** |
| `LAT_WEB_URL` / `LAT_API_URL` / `LAT_INGEST_URL` (+ matching `*_PORT`) | Service URLs/ports. |
| `LAT_TRUSTED_ORIGINS` / `LAT_CORS_ALLOWED_ORIGINS` | Must list your real origins. |
| `VITE_LAT_API_URL` / `VITE_LAT_WEB_URL` | Browser-facing URLs; **build-time-baked today** (P4-1 fixes). |
| `NODE_ENV` | `production` on Tiers 2–3. |

### Optional — tunables with safe defaults

`LAT_PG_POOL_MAX`, `LAT_PG_IDLE_TIMEOUT_MS`, `LAT_PG_CONNECT_TIMEOUT_MS`, `CLICKHOUSE_CLUSTER_ENABLED`, `LAT_REDIS_TLS`, `LAT_REDIS_CLUSTER`, `LAT_BULLMQ_PORT`, `LAT_BULLMQ_PASSWORD`, `LAT_BULLMQ_CLUSTER`, `LAT_BULL_BOARD_USERNAME`/`LAT_BULL_BOARD_PASSWORD` (queue-dashboard auth), `LAT_EXPORT_RATE_LIMIT_*`, `LAT_INGEST_TRACE_RATE_LIMIT_*`, `LAT_WORKERS_HEALTH_PORT`, `LAT_WORKFLOWS_HEALTH_PORT`, `LAT_TEMPORAL_API_KEY` (Temporal Cloud only), `LAT_WEB_BUNDLE_ANALYZE`, `LAT_ALLOWED_EMAIL_DOMAIN`. *(The shared-Redis namespacing vars from P2-4 — `LAT_REDIS_KEY_PREFIX`, `LAT_REDIS_DB`, `LAT_BULLMQ_PREFIX` — join this group once that ships.)*

### Optional — email transport (at least one needed for magic-link / invite login)

Defaults to **Mailpit** (`LAT_MAILPIT_HOST`/`_PORT`/`_FROM`). Alternatives: Mailgun (`LAT_MAILGUN_*`), generic SMTP (`LAT_SMTP_*`), SendGrid (`LAT_SENDGRID_*`). With no transport reachable, transactional email (magic links, invites) won't send.

### Optional — integrations (cleanly no-op when unset)

OAuth (`LAT_GOOGLE_*`, `LAT_GITHUB_*`), Slack (`LAT_SLACK_*`), Stripe billing (`LAT_STRIPE_*`), Cloudflare Turnstile (`LAT_TURNSTILE_SECRET_KEY` + `VITE_LAT_TURNSTILE_SITE_KEY`), observability/OTEL (`LAT_OBSERVABILITY_*`), Latitude dogfood (`LAT_LATITUDE_TELEMETRY_*`, `LAT_LATITUDE_API_URL`), Intercom (`LAT_V2_SUPPORT_APP_*`), PostHog (`LAT_POSTHOG_*`, `VITE_LAT_POSTHOG_*`), Framer changelog (`LAT_FRAMER_*`), GTM (`VITE_LAT_GTM_CONTAINER_ID`), ipinfo GeoIP (`LAT_IPINFO_TOKEN`), Loops lifecycle email (`LAT_LOOPS_API_KEY`), GEPA optimizer (`LAT_GEPA_*`).

### Proprietary-enhancement — AI keys (unset = feature degrades, never a crash)

| Var(s) | Provider | Unlocks |
| --- | --- | --- |
| `LAT_VOYAGE_API_KEY` | Voyage AI | Embeddings + reranking → semantic trace/issue search, search highlights, issue clustering |
| `LAT_ANTHROPIC_API_KEY` | Anthropic | Internal LLM flows — flaggers, evaluations, conversation intelligence, issue summarization, AI generation, annotator optimizations |
| `LAT_AWS_REGION` + `LAT_AWS_ACCESS_KEY_ID`/`_SECRET_ACCESS_KEY`/`_SESSION_TOKEN`/`_BEARER_TOKEN_BEDROCK` | Amazon Bedrock | Same internal LLM flows as Anthropic (alternative provider; region defaults to `eu-central-1`, creds fall back to the AWS provider chain) |

### Minimal required set per tier

- **Tier 1 — Local (dev):** the committed `.env.example` / `.env.development` already boots the whole stack key-free — bundled Postgres/ClickHouse/Redis/Temporal, `fs` storage at `LAT_STORAGE_FS_ROOT`, Mailpit, localhost URLs, and the example dev secrets. **No AI keys** needed; AI features stay inert until a key is added.
- **Tier 2 — Single-host (prod):** the **Core (Required)** rows above with **freshly generated** `LAT_MASTER_ENCRYPTION_KEY` + `LAT_BETTER_AUTH_SECRET`, your real public URLs/origins, a production object store (`fs` on a durable volume / bundled SeaweedFS via the `s3` driver / BYO managed S3), and a real email transport. Add the AI keys for full features.
- **Tier 3 — Cluster:** identical env contract to Tier 2, supplied via k8s Secrets/ConfigMaps; the bundled-vs-external infra toggles (P5-4) decide which `LAT_*` point at in-cluster subcharts vs managed services.

## Appendix C — Feature degradation without proprietary AI (P1-3)

**Boot is always safe.** No AI adapter is constructed at startup; each reads its key lazily and fails per-call with a tagged error (`AIError` / `AICredentialError`). Trace ingest (`apps/ingest` → `ingestSpansUseCase`: decode → sample → enqueue) calls no AI. So every service boots and **core observability works with zero AI keys**.

| Capability | Provider / port | Without the key |
| --- | --- | --- |
| Trace/span ingest, storage, viewing; project/org mgmt; billing | none | **Works** |
| Semantic trace search, search highlights/snippets | Voyage (`AIEmbed`/`AIRerank`) | **Degrades** to lexical/literal search (`get-trace-search-highlights` checks `Effect.serviceOption(AI)` and returns literal highlights) |
| Issue semantic search + candidate reranking | Voyage | **Degrades** to lexical tier |
| Issue clustering / discovery embeddings | Voyage | Discovery step that needs embeddings can't run |
| Flaggers (AI-drafted annotations) | Anthropic / Bedrock (`AIGenerate`) | Per-job failure with a clear message |
| Evaluations (LLM-as-judge); evaluation/annotator optimization | Anthropic / Bedrock | Per-job failure |
| Conversation intelligence / session analysis | Anthropic / Bedrock | Per-job failure |
| Issue summarization / details refresh; annotation enrichment; AI generation | Anthropic / Bedrock | Per-job failure |

Error strings (for docs/UX): `"Voyage AI is unavailable: set LAT_VOYAGE_API_KEY."`, `"Anthropic is unavailable: set LAT_ANTHROPIC_API_KEY."`, `"Amazon Bedrock is unavailable: set LAT_AWS_REGION."` The exact UX surface (hidden vs disabled-with-tooltip vs empty state) is an open question owned by P4-4.

## Appendix D — Canonical self-host profile (P1-5)

The single blessed configuration verified per tier. **Today it documents the proprietary-AI requirement; Phase 6 makes it fully OSS.**

**Images (the P4-1 target):** env-neutral `ghcr.io/latitude-dev/latitude-<service>` for the 6 build targets (`api`, `ingest`, `workers`, `workflows`, `web`, `migrations`), pinned to a `:vX.Y.Z` release tag (`:development` = edge). **One image set, three tiers** — only orchestration differs.

**Adapters (the OSS-default ports):**

- **Postgres + pgvector** (`pgvector/pgvector:pg16`) — dedicated `latitude` schema; requires the `vector` extension and a schema-create admin role.
- **ClickHouse** (`clickhouse/clickhouse-server`) — dedicated `CLICKHOUSE_DB` database.
- **Redis ×2** (cache + BullMQ) — namespaced for shared instances after P2-4.
- **Temporal** (`temporalio/auto-setup`, Postgres-backed default + visibility store, no Elasticsearch) — dedicated namespace + task queue.
- **Object storage** — `fs` (Tier 1) / bundled **SeaweedFS** behind the `s3` driver (Tier 2/3) / BYO managed S3.
- **Email** — Mailpit (dev) or any SMTP / Mailgun / SendGrid (prod).

**Proprietary-AI requirement (current, until Phase 6):**

- Embeddings + reranking → **Voyage AI** (`LAT_VOYAGE_API_KEY`). Unset ⇒ search degrades to lexical, clustering reduced.
- Internal LLM flows → **Anthropic** (`LAT_ANTHROPIC_API_KEY`) and/or **Amazon Bedrock** (`LAT_AWS_*`). Unset ⇒ flaggers/evals/summaries/etc. disabled per-call.

**Guarantee:** with **no** AI keys the stack still boots and serves core observability (ingest + trace viewing); AI features light up as keys are added. Every shipped runtime dependency is permissive (MIT / Apache / BSD / ISC) — see [Appendix A](#appendix-a--dependency-license--self-hosting-audit).
