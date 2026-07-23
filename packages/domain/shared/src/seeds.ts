import {
  ApiKeyId,
  DatasetId,
  DatasetVersionId,
  EvaluationId,
  MembershipId,
  OrganizationId,
  ProjectId,
  ScoreId,
  SignalId,
  SimulationId,
  UserId,
} from "./id.ts"
import { LATITUDE_TELEMETRY_PROJECT_SLUGS } from "./telemetry-projects.ts"

// ---------------------------------------------------------------------------
// Organization, users, project, API key
// ---------------------------------------------------------------------------

export const SEED_ORG_ID = OrganizationId("iapkf6osmlm7mbw9kulosua4")
export const SEED_OWNER_USER_ID = UserId("ye9d77pxi50nh1gyqljkffnb")
export const SEED_ADMIN_USER_ID = UserId("uzm4d8pb5k0bd2oug9ud2xjs")
export const SEED_PROJECT_ID = ProjectId("yvl1e78evmwfs2mosyjb08rc")
export const SEED_API_KEY_ID = ApiKeyId("v42lqe92hgq2hpvilg91brnt")
export const SEED_OWNER_MEMBERSHIP_ID = MembershipId("bg5hvjzpeop0atmz2nqydas7")
export const SEED_ADMIN_MEMBERSHIP_ID = MembershipId("h5q2nionpzqmzvkgp0sp7jnl")

/** Extra org members for local/demo UI (e.g. avatar group overflow). */
export const SEED_MEMBER_1_USER_ID = UserId("kqltyaqoedqliiofhr9ch5uc")
export const SEED_MEMBER_1_EMAIL = "alex@acme.com"
export const SEED_MEMBER_1_MEMBERSHIP_ID = MembershipId("xw5utp538a8jocgpazfme469")

export const SEED_MEMBER_2_USER_ID = UserId("errv2rpb1sl9dpsd433os575")
export const SEED_MEMBER_2_EMAIL = "blake@acme.com"
export const SEED_MEMBER_2_MEMBERSHIP_ID = MembershipId("ol6zvng4mmr0wpc6qym4ayrb")

export const SEED_MEMBER_3_USER_ID = UserId("jrq3xunv2cznb53ed23gd9j2")
export const SEED_MEMBER_3_EMAIL = "casey@acme.com"
export const SEED_MEMBER_3_MEMBERSHIP_ID = MembershipId("hl4r7z5sjja47wiq1w227sx5")

export const SEED_MEMBER_4_USER_ID = UserId("ubjiu0ymowe5q1hnl22fr892")
export const SEED_MEMBER_4_EMAIL = "dana@acme.com"
export const SEED_MEMBER_4_MEMBERSHIP_ID = MembershipId("emud7q05yowvbyrhxi1e447p")

export const SEED_MEMBER_5_USER_ID = UserId("ov2an3fp4db0177upoaog2i1")
export const SEED_MEMBER_5_EMAIL = "eli@acme.com"
export const SEED_MEMBER_5_MEMBERSHIP_ID = MembershipId("amc2xugd6ew7fo7mbsjps262")

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

export const SEED_WARRANTY_DATASET_ID = DatasetId("w1a2r3r4a5n6t7y8d9s0e1t2")
export const SEED_WARRANTY_DATASET_VERSION_ID = DatasetVersionId("v1w2a3r4r5a6n7t8y9d0s1e2")

/** Dangerous combination dataset retained as the second mature lifecycle. */
export const SEED_DATASET_ID = DatasetId("m8k2p4r6t0v1w3x5y7z9a1b3")
export const SEED_DATASET_VERSION_ID = DatasetVersionId("v1a2b3c4d5e6f7g8h9i0j1k2")

// ---------------------------------------------------------------------------
// Signals and evaluations
// ---------------------------------------------------------------------------

/** Signal 1: mature warranty fabrication lifecycle. */
export const SEED_SIGNAL_ID = SignalId("dds0rt8sqgpuku4u4wabze9r")
export const SEED_SIGNAL_UUID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"

/** Signal 2: mature dangerous-combination lifecycle. */
export const SEED_COMBINATION_SIGNAL_ID = SignalId("c1o2m3b4i5n6a7t8i9o0n1s2")
export const SEED_COMBINATION_SIGNAL_UUID = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e"

/** Signal 3: generate-ready logistics / service guarantees issue. */
export const SEED_GENERATE_SIGNAL_ID = SignalId("g1e2n3e4r5a6t7e8i9s0s1u2")
export const SEED_GENERATE_SIGNAL_UUID = "c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f"

/** Signal 4: resolved returns-policy drift issue. */
export const SEED_RETURNS_SIGNAL_ID = SignalId("r1e2t3u4r5n6p7o8l9i0c1y2")
export const SEED_RETURNS_SIGNAL_UUID = "d4e5f6a7-b8c9-4d1e-9f2a-3b4c5d6e7f80"

/** Signal 5: ignored courtesy-credit issue. */
export const SEED_BILLING_SIGNAL_ID = SignalId("b1i2l3l4i5n6g7c8r9e0d1t2")
export const SEED_BILLING_SIGNAL_UUID = "e5f6a7b8-c9d1-4e2f-8a3b-4c5d6e7f8091"

/** Signal 6: active account-recovery issue. */
export const SEED_ACCESS_SIGNAL_ID = SignalId("a1c2c3o4u5n6t7r8e9c0o1v2")
export const SEED_ACCESS_SIGNAL_UUID = "f6a7b8c9-d1e2-4f3a-9b4c-5d6e7f8091a2"
/** Signal 7: historical installation-certification issue. */
export const SEED_INSTALLATION_SIGNAL_ID = SignalId("i1n2s3t4a5l6l7c8e9r0t1f2")
export const SEED_INSTALLATION_SIGNAL_UUID = "0a7b8c9d-e1f2-4a3b-8c4d-5e6f7091a2b3"

/** Signal 8: active issue seeded from flagger-authored annotations. */
export const SEED_FLAGGER_SIGNAL_ID = SignalId("f1l2a3g4g5e6r7e8m9p0t1y2")
export const SEED_FLAGGER_SIGNAL_UUID = "1b8c9d0e-f1a2-4b3c-9d4e-5f6071a2b3c4"

function fixedSeedEntityId(prefix: string, index: number): string {
  return `${prefix}${index.toString().padStart(3, "0")}${"x".repeat(24 - prefix.length - 3)}`
}

function fixedSeedUuid(index: number): string {
  return `10000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`
}

/** Additional long-tail issue IDs used to exercise pagination, infinite scroll, and denoising. */
export const SEED_EXTRA_SIGNAL_IDS: readonly SignalId[] = Array.from({ length: 128 }, (_, i) =>
  SignalId(fixedSeedEntityId("xi", i)),
)
export const SEED_EXTRA_SIGNAL_UUIDS: readonly string[] = Array.from({ length: 128 }, (_, i) =>
  fixedSeedUuid(0x500 + i),
)

/** Signal 1 active monitor. */
export const SEED_EVALUATION_ID = EvaluationId("y0zr3gtsous6knd2qwdj1dit")
/** Signal 1 archived historical monitor. */
export const SEED_EVALUATION_ARCHIVED_ID = EvaluationId("hphb8g6uwzx68pfh9hzormqn")
/** Signal 2 active monitor. */
export const SEED_COMBINATION_EVALUATION_ID = EvaluationId("c1o2m3b4e5v6a7l8u9a0t1e2")
/** Signal 4 active monitor retained after the issue resolved. */
export const SEED_RETURNS_EVALUATION_ID = EvaluationId("r1e2t3u4r5n6e7v8a9l0u1a2")
/** Signal 6 active monitor. */
export const SEED_ACCESS_EVALUATION_ID = EvaluationId("a1c2c3e4s5s6e7v8a9l0u1a2")

export const SEED_WARRANTY_EVALUATION_HASH = "aa11bb22cc33dd44ee55ff66aa77bb88cc99dd00"
export const SEED_WARRANTY_ARCHIVED_EVALUATION_HASH = "bb11cc22dd33ee44ff55aa66bb77cc88dd99ee00"
export const SEED_COMBINATION_EVALUATION_HASH = "cc11dd22ee33ff44aa55bb66cc77dd88ee99ff00"
export const SEED_RETURNS_EVALUATION_HASH = "dd11ee22ff33aa44bb55cc66dd77ee88ff99aa00"
export const SEED_ACCESS_EVALUATION_HASH = "ee11ff22aa33bb44cc55dd66ee77ff88aa99bb00"
export const SEED_GROUNDING_EVALUATION_HASH = "ff11aa22bb33cc44dd55ee66ff77aa88bb99cc00"
export const SEED_RECALL_EVALUATION_HASH = "ab12cd34ef56ab78cd90ef12ab34cd56ef78ab90"

// ---------------------------------------------------------------------------
// Simulations
// ---------------------------------------------------------------------------

export const SEED_WARRANTY_SIMULATION_ID = SimulationId("s1i2m3w4a5r6r7a8n9t0y1a2")
export const SEED_SIMULATION_ID = SimulationId("sim0k7x9g2m4n5p8q1r3s6t0")
export const SEED_SIMULATION_ERRORED_ID = SimulationId("sim1v2w3x4y5z6a7b8c9d0e1")

// ---------------------------------------------------------------------------
// Score IDs
// ---------------------------------------------------------------------------

export const SEED_SCORE_PASSED_ID = ScoreId("qfz1jxhx5p8gzukyz22tz5du")
export const SEED_SCORE_ERRORED_ID = ScoreId("araxu4s45cudpufdqiioo5a5")
export const SEED_SCORE_DRAFT_ID = ScoreId("n1hjgos7a7dxb61plvmiigcu")
export const SEED_SCORE_PENDING_ID = ScoreId("hiy75x2kq8hjhi27qkl9zaeb")
export const SEED_SCORE_API_REVIEWED_ID = ScoreId("hvtb8yzxjjrudvhrme7aejiq")
export const SEED_SCORE_WARRANTY_SIMULATION_ACTIVE_ID = ScoreId("s1w2a3r4r5s6i7m8a9c0t1v2")
export const SEED_SCORE_WARRANTY_SIMULATION_ARCHIVED_ID = ScoreId("s1w2a3r4r5s6i7m8a9r0c1h2")
export const SEED_SCORE_COMBINATION_SIMULATION_ID = ScoreId("s1c2o3m4b5s6i7m8a9c0t1v2")

// ---------------------------------------------------------------------------
// Relative timeline helpers
// ---------------------------------------------------------------------------

export const SEED_TIMELINE_WINDOW_DAYS = 90

const seedTimelineNow = new Date()

/**
 * Stable day anchor for seeding across stores.
 * Using the current UTC day keeps issue states useful over time while avoiding
 * clock-drift noise between separate Postgres and ClickHouse seed commands.
 */
export const SEED_TIMELINE_ANCHOR = new Date(
  Date.UTC(seedTimelineNow.getUTCFullYear(), seedTimelineNow.getUTCMonth(), seedTimelineNow.getUTCDate(), 12, 0, 0, 0),
)

/**
 * Free-function variants that anchor on `SEED_TIMELINE_ANCHOR`. Retained for
 * a small number of test fixtures that import them directly. Production seed
 * code goes through `scope.dateDaysAgo` / `scope.timestampDaysAgo` so the
 * runtime "Create Demo Project" path uses the workflow's per-call anchor
 * instead of this module-level constant.
 */
export function seedDateDaysAgo(daysAgo: number, hour = 12, minute = 0): Date {
  const date = new Date(SEED_TIMELINE_ANCHOR)
  date.setUTCDate(date.getUTCDate() - daysAgo)
  date.setUTCHours(hour, minute, 0, 0)
  return date.getTime() > seedTimelineNow.getTime() ? new Date(seedTimelineNow) : date
}

export function seedTimestampDaysAgo(daysAgo: number, hour = 12, minute = 0): string {
  return seedDateDaysAgo(daysAgo, hour, minute).toISOString().slice(0, 23).replace("T", " ")
}

// ---------------------------------------------------------------------------
// Deterministic trace/span IDs
// ---------------------------------------------------------------------------

function fixedTraceHex(prefix: string, index: number): string {
  return `${prefix}${index.toString(16).padStart(6, "0")}${"0".repeat(24)}`
}

function fixedSpanHex(prefix: string, index: number): string {
  return `${prefix}${index.toString(16).padStart(6, "0")}${"0".repeat(8)}`
}

export function seedSignalOccurrenceTraceId(index: number): string {
  return fixedTraceHex("ef", index)
}

export function seedSignalOccurrenceSpanId(index: number): string {
  return fixedSpanHex("ef", index)
}

/** 48 annotation trace IDs (Signal 1: 0-15, Signal 2: 16-37, Signal 3: 38-47). */
export const SEED_ANNOTATION_TRACE_IDS: readonly string[] = Array.from({ length: 48 }, (_, i) => fixedTraceHex("af", i))
export const SEED_ANNOTATION_SPAN_IDS: readonly string[] = Array.from({ length: 48 }, (_, i) => fixedSpanHex("af", i))

/** 25 additional alignment fixture trace IDs */
export const SEED_ALIGNMENT_FIXTURE_TRACE_IDS: readonly string[] = Array.from({ length: 25 }, (_, i) =>
  fixedTraceHex("bf", 100 + i),
)
export const SEED_ALIGNMENT_FIXTURE_SPAN_IDS: readonly string[] = Array.from({ length: 25 }, (_, i) =>
  fixedSpanHex("bf", 100 + i),
)

/** 4 demo trace IDs for JSON-formatted assistant responses (compact + prettified). */
export const SEED_JSON_RESPONSE_TRACE_IDS: readonly string[] = Array.from({ length: 4 }, (_, i) =>
  fixedTraceHex("1f", i),
)
export const SEED_JSON_RESPONSE_SPAN_IDS: readonly string[] = Array.from({ length: 4 }, (_, i) => fixedSpanHex("1f", i))

/** 5 lifecycle score trace IDs */
export const SEED_LIFECYCLE_TRACE_IDS: readonly string[] = [
  "11111111111111111111111111111111",
  "22222222222222222222222222222222",
  "33333333333333333333333333333333",
  "44444444444444444444444444444444",
  "55555555555555555555555555555555",
]
export const SEED_LIFECYCLE_SPAN_IDS: readonly string[] = [
  "0101010101010101",
  "0202020202020202",
  "0303030303030303",
  "0404040404040404",
  "0505050505050505",
]

/** 12 deterministic spans for the warranty simulation run. */
export const SEED_WARRANTY_SIMULATION_TRACE_IDS: readonly string[] = Array.from({ length: 12 }, (_, i) =>
  fixedTraceHex("cf", i),
)
export const SEED_WARRANTY_SIMULATION_SPAN_IDS: readonly string[] = Array.from({ length: 12 }, (_, i) =>
  fixedSpanHex("cf", i),
)

/** 20 deterministic spans for the dangerous-combination simulation run. */
export const SEED_COMBINATION_SIMULATION_TRACE_IDS: readonly string[] = Array.from({ length: 20 }, (_, i) =>
  fixedTraceHex("df", i),
)
export const SEED_COMBINATION_SIMULATION_SPAN_IDS: readonly string[] = Array.from({ length: 20 }, (_, i) =>
  fixedSpanHex("df", i),
)

// ---------------------------------------------------------------------------
// Annotation UI demo (mixed provenances, anchors, draft/published states)
// ---------------------------------------------------------------------------

/** Dedicated trace for annotation UI polish feature testing (30+ messages). */
export const SEED_ANNOTATION_DEMO_TRACE_ID = "a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0"
export const SEED_ANNOTATION_DEMO_SPAN_ID = "b0b0b0b0b0b0b0b0"

/** 12 annotation score IDs for the demo trace (see PRD for provenance/anchor distribution). */
export const SEED_UI_POLISH_SCORE_IDS = {
  humanDraft1: ScoreId("uip01humandraft1xxxxxxxx"),
  humanDraft2: ScoreId("uip02humandraft2xxxxxxxx"),
  humanDraft3: ScoreId("uip03humandraft3xxxxxxxx"),
  humanPublished1: ScoreId("uip04humanpub01xxxxxxxxx"),
  humanPublished2: ScoreId("uip05humanpub02xxxxxxxxx"),
  humanPublished3: ScoreId("uip06humanpub03xxxxxxxxx"),
  agentDraft1: ScoreId("uip07agentdraft1xxxxxxxx"),
  agentDraft2: ScoreId("uip08agentdraft2xxxxxxxx"),
  agentDraft3: ScoreId("uip09agentdraft3xxxxxxxx"),
  agentPublished1: ScoreId("uip10agentpub01xxxxxxxxx"),
  agentPublished2: ScoreId("uip11agentpub02xxxxxxxxx"),
  apiPublished1: ScoreId("uip12apipub0001xxxxxxxxx"),
} as const

// ---------------------------------------------------------------------------
// Organization/project display values
// ---------------------------------------------------------------------------

export const SEED_ORG_NAME = "Acme Inc."
export const SEED_ORG_SLUG = "acme"
export const SEED_OWNER_EMAIL = "owner@acme.com"
export const SEED_ADMIN_EMAIL = "admin@acme.com"
export const SEED_PROJECT_NAME = "Support Agent"
export const SEED_PROJECT_SLUG = "default-project"

// QA fixture: a project whose traces are ALL older than the 30-day default window, so it has
// `first_trace_at` set but zero recent spans — the exact shape that used to trip the "Waiting for
// your first trace" onboarding. Seed it (`pnpm seed`) and open `/projects/old-traces-qa`.
export const SEED_OLD_TRACES_QA_PROJECT_ID = ProjectId("oldtracesqaproject000001")
export const SEED_OLD_TRACES_QA_PROJECT_NAME = "Old traces (QA)"
export const SEED_OLD_TRACES_QA_PROJECT_SLUG = "old-traces-qa"
export const SEED_OLD_TRACES_QA_FROM_DAYS_AGO = 45
export const SEED_OLD_TRACES_QA_TO_DAYS_AGO = 31
export const SEED_API_KEY_TOKEN = "lat_seed_default_api_key_token"

// Dogfood projects — one per internal AI feature, mirroring
// `LATITUDE_TELEMETRY_PROJECT_SLUGS`. Each receives the LLM generations that
// feature exports (and, for flaggers / annotation-enrichment, the product-feedback
// annotations written back by `@platform/latitude-api`). All live in the seed org
// so the shared API key token authenticates every one. Slugs come from the shared
// constant so routing and seed never drift; IDs/names are seed-only.
export const SEED_LATITUDE_SIGNAL_DISCOVERY_PROJECT_ID = ProjectId("issudiscov01afjbcb7gzwla")
export const SEED_LATITUDE_SIGNAL_DISCOVERY_PROJECT_NAME = "Latitude Signal Discovery"
export const SEED_LATITUDE_SIGNAL_DISCOVERY_PROJECT_SLUG = LATITUDE_TELEMETRY_PROJECT_SLUGS.signalDiscovery

export const SEED_LATITUDE_ANNOTATION_ENRICHMENT_PROJECT_ID = ProjectId("annoenrich02afjbcb7gzwlb")
export const SEED_LATITUDE_ANNOTATION_ENRICHMENT_PROJECT_NAME = "Latitude Annotation Enrichment"
export const SEED_LATITUDE_ANNOTATION_ENRICHMENT_PROJECT_SLUG = LATITUDE_TELEMETRY_PROJECT_SLUGS.annotationEnrichment

export const SEED_LATITUDE_FLAGGERS_PROJECT_ID = ProjectId("flagrsproj03afjbcb7gzwlc")
export const SEED_LATITUDE_FLAGGERS_PROJECT_NAME = "Latitude Flaggers"
export const SEED_LATITUDE_FLAGGERS_PROJECT_SLUG = LATITUDE_TELEMETRY_PROJECT_SLUGS.flaggers

export const SEED_LATITUDE_EVALUATIONS_PROJECT_ID = ProjectId("evaluation04afjbcb7gzwld")
export const SEED_LATITUDE_EVALUATIONS_PROJECT_NAME = "Latitude Evaluations"
export const SEED_LATITUDE_EVALUATIONS_PROJECT_SLUG = LATITUDE_TELEMETRY_PROJECT_SLUGS.evaluations

export const SEED_LATITUDE_OPTIMIZATIONS_PROJECT_ID = ProjectId("optimizatn05afjbcb7gzwle")
export const SEED_LATITUDE_OPTIMIZATIONS_PROJECT_NAME = "Latitude Optimizations"
export const SEED_LATITUDE_OPTIMIZATIONS_PROJECT_SLUG = LATITUDE_TELEMETRY_PROJECT_SLUGS.optimizations

export const SEED_LATITUDE_TAXONOMY_PROJECT_ID = ProjectId("taxonomypr06afjbcb7gzwlf")
export const SEED_LATITUDE_TAXONOMY_PROJECT_NAME = "Latitude Taxonomy"
export const SEED_LATITUDE_TAXONOMY_PROJECT_SLUG = LATITUDE_TELEMETRY_PROJECT_SLUGS.taxonomy

export const SEED_LATITUDE_SIGNAL_GENERATION_PROJECT_ID = ProjectId("signalgen008afjbcb7gzwlh")
export const SEED_LATITUDE_SIGNAL_GENERATION_PROJECT_NAME = "Latitude Signal Generation"
export const SEED_LATITUDE_SIGNAL_GENERATION_PROJECT_SLUG = LATITUDE_TELEMETRY_PROJECT_SLUGS.signalGeneration

export const SEED_LATITUDE_CONVERSATION_INTELLIGENCE_PROJECT_ID = ProjectId("convintel009afjbcb7gzwli")
export const SEED_LATITUDE_CONVERSATION_INTELLIGENCE_PROJECT_NAME = "Latitude Conversation Intelligence"
export const SEED_LATITUDE_CONVERSATION_INTELLIGENCE_PROJECT_SLUG =
  LATITUDE_TELEMETRY_PROJECT_SLUGS.conversationIntelligence

// ---------------------------------------------------------------------------
// Test Mode — second org (empty-sandbox state) and Acme sandboxes
// ---------------------------------------------------------------------------

/**
 * Second top-level org with no sandboxes. Exercises the "create your first
 * sandbox" empty state distinct from Acme (which has two sandboxes seeded
 * below) so Wave 2 UI work can demo both branches against `pnpm db:seed`.
 */
export const SEED_BETA_ORG_ID = OrganizationId("bet4c00rg1seed00000000ab")
export const SEED_BETA_ORG_NAME = "Beta Co."
export const SEED_BETA_ORG_SLUG = "beta"

export const SEED_BETA_OWNER_USER_ID = UserId("bet4ownr0user000000000ab")
export const SEED_BETA_OWNER_EMAIL = "owner@beta.com"
export const SEED_BETA_OWNER_MEMBERSHIP_ID = MembershipId("bet4ownr0memb000000000ab")

export const SEED_BETA_MEMBER_USER_ID = UserId("bet4mbr10user000000000ab")
export const SEED_BETA_MEMBER_EMAIL = "alex@beta.com"
export const SEED_BETA_MEMBER_MEMBERSHIP_ID = MembershipId("bet4mbr10memb000000000ab")

export const SEED_BETA_PROJECT_ID = ProjectId("bet4pr0j0default00000ab1")
export const SEED_BETA_PROJECT_NAME = "Support Agent"
export const SEED_BETA_PROJECT_SLUG = "default-project"

/**
 * Acme sandbox #1 — `active`. Has one linked sandbox project pointing at
 * Acme's default project by stable id.
 */
export const SEED_ACME_SANDBOX_ACTIVE_ORG_ID = OrganizationId("acmesbx1act000000000000a")
export const SEED_ACME_SANDBOX_ACTIVE_NAME = "Dev sandbox"
export const SEED_ACME_SANDBOX_ACTIVE_SLUG = "acme-dev-sandbox"
/** PK of the 1:1 sandbox-attrs row keyed to `SEED_ACME_SANDBOX_ACTIVE_ORG_ID`. */
export const SEED_ACME_SANDBOX_ACTIVE_ATTRS_ID = "acmesbx1act0attrs00000a1"
/** Sandbox project under the active sandbox, linked to `SEED_PROJECT_ID`. */
export const SEED_ACME_SANDBOX_ACTIVE_PROJECT_ID = ProjectId("acmesbx1act0proj000000a1")
/**
 * Default API key for the active sandbox org. Carries the `lat_sandbox_` prefix
 * so seeded sandboxes can ingest locally and so the prefix is exercised in dev,
 * mirroring how `createSandbox` mints one for real sandboxes.
 */
export const SEED_ACME_SANDBOX_ACTIVE_API_KEY_ID = ApiKeyId("acmesbx1act0apikey0000a1")
export const SEED_ACME_SANDBOX_ACTIVE_API_KEY_TOKEN = "lat_sandbox_seed_default_api_key_token"

/**
 * Acme sandbox #2 — `archived`. Idle past the 7-day threshold; surfaces the
 * "asleep / reactivate" branch in the UI.
 */
export const SEED_ACME_SANDBOX_ARCHIVED_ORG_ID = OrganizationId("acmesbx2arc000000000000a")
export const SEED_ACME_SANDBOX_ARCHIVED_NAME = "Old sandbox"
export const SEED_ACME_SANDBOX_ARCHIVED_SLUG = "acme-old-sandbox"
export const SEED_ACME_SANDBOX_ARCHIVED_ATTRS_ID = "acmesbx2arc0attrs00000a2"
export const SEED_ACME_SANDBOX_ARCHIVED_PROJECT_ID = ProjectId("acmesbx2arc0proj000000a2")
