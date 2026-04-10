import {
  AnnotationQueueId,
  AnnotationQueueItemId,
  ApiKeyId,
  DatasetId,
  DatasetVersionId,
  EvaluationId,
  IssueId,
  MembershipId,
  OrganizationId,
  ProjectId,
  ScoreId,
  SimulationId,
  UserId,
} from "./id.ts"

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

/** Owner, admin, and five members — seven users for queues that need a large assignee list. */
export const SEED_MANUAL_QUEUE_ASSIGNEES = [
  SEED_OWNER_USER_ID,
  SEED_ADMIN_USER_ID,
  SEED_MEMBER_1_USER_ID,
  SEED_MEMBER_2_USER_ID,
  SEED_MEMBER_3_USER_ID,
  SEED_MEMBER_4_USER_ID,
  SEED_MEMBER_5_USER_ID,
] as const

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

export const SEED_WARRANTY_DATASET_ID = DatasetId("w1a2r3r4a5n6t7y8d9s0e1t2")
export const SEED_WARRANTY_DATASET_VERSION_ID = DatasetVersionId("v1w2a3r4r5a6n7t8y9d0s1e2")

/** Dangerous combination dataset retained as the second mature lifecycle. */
export const SEED_DATASET_ID = DatasetId("m8k2p4r6t0v1w3x5y7z9a1b3")
export const SEED_DATASET_VERSION_ID = DatasetVersionId("v1a2b3c4d5e6f7g8h9i0j1k2")

// ---------------------------------------------------------------------------
// Issues and evaluations
// ---------------------------------------------------------------------------

/** Issue 1: mature warranty fabrication lifecycle. */
export const SEED_ISSUE_ID = IssueId("dds0rt8sqgpuku4u4wabze9r")
export const SEED_ISSUE_UUID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"

/** Issue 2: mature dangerous-combination lifecycle. */
export const SEED_COMBINATION_ISSUE_ID = IssueId("c1o2m3b4i5n6a7t8i9o0n1s2")
export const SEED_COMBINATION_ISSUE_UUID = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e"

/** Issue 3: generate-ready logistics / service guarantees issue. */
export const SEED_GENERATE_ISSUE_ID = IssueId("g1e2n3e4r5a6t7e8i9s0s1u2")
export const SEED_GENERATE_ISSUE_UUID = "c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f"

/** Issue 4: resolved returns-policy drift issue. */
export const SEED_RETURNS_ISSUE_ID = IssueId("r1e2t3u4r5n6p7o8l9i0c1y2")
export const SEED_RETURNS_ISSUE_UUID = "d4e5f6a7-b8c9-4d1e-9f2a-3b4c5d6e7f80"

/** Issue 5: ignored courtesy-credit issue. */
export const SEED_BILLING_ISSUE_ID = IssueId("b1i2l3l4i5n6g7c8r9e0d1t2")
export const SEED_BILLING_ISSUE_UUID = "e5f6a7b8-c9d1-4e2f-8a3b-4c5d6e7f8091"

/** Issue 6: active account-recovery issue. */
export const SEED_ACCESS_ISSUE_ID = IssueId("a1c2c3o4u5n6t7r8e9c0o1v2")
export const SEED_ACCESS_ISSUE_UUID = "f6a7b8c9-d1e2-4f3a-9b4c-5d6e7f8091a2"
/** Issue 7: historical installation-certification issue. */
export const SEED_INSTALLATION_ISSUE_ID = IssueId("i1n2s3t4a5l6l7c8e9r0t1f2")
export const SEED_INSTALLATION_ISSUE_UUID = "0a7b8c9d-e1f2-4a3b-8c4d-5e6f7091a2b3"

function fixedSeedEntityId(prefix: string, index: number): string {
  return `${prefix}${index.toString().padStart(3, "0")}${"x".repeat(24 - prefix.length - 3)}`
}

function fixedSeedUuid(index: number): string {
  return `10000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`
}

/** Additional long-tail issue IDs used to exercise pagination, infinite scroll, and denoising. */
export const SEED_EXTRA_ISSUE_IDS: readonly IssueId[] = Array.from({ length: 128 }, (_, i) =>
  IssueId(fixedSeedEntityId("xi", i)),
)
export const SEED_EXTRA_ISSUE_UUIDS: readonly string[] = Array.from({ length: 128 }, (_, i) => fixedSeedUuid(0x500 + i))

/** Issue 1 active monitor. */
export const SEED_EVALUATION_ID = EvaluationId("y0zr3gtsous6knd2qwdj1dit")
/** Issue 1 archived historical monitor. */
export const SEED_EVALUATION_ARCHIVED_ID = EvaluationId("hphb8g6uwzx68pfh9hzormqn")
/** Issue 2 active monitor. */
export const SEED_COMBINATION_EVALUATION_ID = EvaluationId("c1o2m3b4e5v6a7l8u9a0t1e2")
/** Issue 4 active monitor retained after the issue resolved. */
export const SEED_RETURNS_EVALUATION_ID = EvaluationId("r1e2t3u4r5n6e7v8a9l0u1a2")
/** Issue 6 active monitor. */
export const SEED_ACCESS_EVALUATION_ID = EvaluationId("a1c2c3e4s5s6e7v8a9l0u1a2")

export const SEED_WARRANTY_EVALUATION_HASH = "aa11bb22cc33dd44ee55ff66aa77bb88cc99dd00"
export const SEED_WARRANTY_ARCHIVED_EVALUATION_HASH = "bb11cc22dd33ee44ff55aa66bb77cc88dd99ee00"
export const SEED_COMBINATION_EVALUATION_HASH = "cc11dd22ee33ff44aa55bb66cc77dd88ee99ff00"
export const SEED_RETURNS_EVALUATION_HASH = "dd11ee22ff33aa44bb55cc66dd77ee88ff99aa00"
export const SEED_ACCESS_EVALUATION_HASH = "ee11ff22aa33bb44cc55dd66ee77ff88aa99bb00"

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

export const SEED_ANNOTATION_QUEUE_WARRANTY_ID = AnnotationQueueId("q1w2e3r4t5y6u7i8o9p0a1s2")
export const SEED_ANNOTATION_QUEUE_COMBINATION_ID = AnnotationQueueId("m1a2n3u4a5l6c7o8m9b0q1u2")
export const SEED_ANNOTATION_QUEUE_LOGISTICS_ID = AnnotationQueueId("l1o2g3i4s5t6i7c8s9q0u1e2")
export const SEED_ANNOTATION_QUEUE_SYSTEM_ID = AnnotationQueueId("aq2icpkri3o99sw0u24hy50w")
export const SEED_ANNOTATION_QUEUE_LIVE_ID = AnnotationQueueId("hikmfvizwaptzothgqtllelw")

export const SEED_ANNOTATION_QUEUE_ITEM_WARRANTY_PENDING_ID = AnnotationQueueItemId("w1a2r3n4t5y6p7e8n9d0i1n2")
export const SEED_ANNOTATION_QUEUE_ITEM_WARRANTY_COMPLETED_A_ID = AnnotationQueueItemId("w1a2r3c4o5m6p7l8e9t0a1a2")
export const SEED_ANNOTATION_QUEUE_ITEM_WARRANTY_COMPLETED_B_ID = AnnotationQueueItemId("w1a2r3c4o5m6p7l8e9t0b1b2")

export const SEED_ANNOTATION_QUEUE_ITEM_COMBINATION_PENDING_ID = AnnotationQueueItemId("c1o2m3b4p5e6n7d8i9n0g1a2")
export const SEED_ANNOTATION_QUEUE_ITEM_COMBINATION_COMPLETED_A_ID = AnnotationQueueItemId("c1o2m3b4c5o6m7p8a9a0a1a2")
export const SEED_ANNOTATION_QUEUE_ITEM_COMBINATION_COMPLETED_B_ID = AnnotationQueueItemId("c1o2m3b4c5o6m7p8b9b0b1b2")

export const SEED_ANNOTATION_QUEUE_ITEM_LOGISTICS_PENDING_ID = AnnotationQueueItemId("l1o2g3i4p5e6n7d8i9n0g1a2")
export const SEED_ANNOTATION_QUEUE_ITEM_LOGISTICS_COMPLETED_A_ID = AnnotationQueueItemId("l1o2g3i4c5o6m7p8a9a0a1a2")
export const SEED_ANNOTATION_QUEUE_ITEM_LOGISTICS_COMPLETED_B_ID = AnnotationQueueItemId("l1o2g3i4c5o6m7p8b9b0b1b2")

export const SEED_ANNOTATION_QUEUE_ITEM_SYSTEM_PENDING_ID = AnnotationQueueItemId("s1y2s3t4e5m6p7e8n9d0i1n2")
export const SEED_ANNOTATION_QUEUE_ITEM_LIVE_PENDING_ID = AnnotationQueueItemId("l1i2v3e4p5e6n7d8i9n0g1a2")

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

/** 48 annotation trace IDs (Issue 1: 0-15, Issue 2: 16-37, Issue 3: 38-47). */
export const SEED_ANNOTATION_TRACE_IDS: readonly string[] = Array.from({ length: 48 }, (_, i) => fixedTraceHex("af", i))
export const SEED_ANNOTATION_SPAN_IDS: readonly string[] = Array.from({ length: 48 }, (_, i) => fixedSpanHex("af", i))

/** 25 additional alignment fixture trace IDs */
export const SEED_ALIGNMENT_FIXTURE_TRACE_IDS: readonly string[] = Array.from({ length: 25 }, (_, i) =>
  fixedTraceHex("bf", 100 + i),
)
export const SEED_ALIGNMENT_FIXTURE_SPAN_IDS: readonly string[] = Array.from({ length: 25 }, (_, i) =>
  fixedSpanHex("bf", 100 + i),
)

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
// Organization/project display values
// ---------------------------------------------------------------------------

export const SEED_ORG_NAME = "Acme Inc."
export const SEED_ORG_SLUG = "acme"
export const SEED_OWNER_EMAIL = "owner@acme.com"
export const SEED_ADMIN_EMAIL = "admin@acme.com"
export const SEED_PROJECT_NAME = "Default Project"
export const SEED_PROJECT_SLUG = "default-project"
