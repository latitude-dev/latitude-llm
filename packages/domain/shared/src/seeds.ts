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

// Constants for seeding the database with initial data
export const SEED_ORG_ID = OrganizationId("iapkf6osmlm7mbw9kulosua4")
export const SEED_OWNER_USER_ID = UserId("ye9d77pxi50nh1gyqljkffnb")
export const SEED_ADMIN_USER_ID = UserId("uzm4d8pb5k0bd2oug9ud2xjs")
export const SEED_PROJECT_ID = ProjectId("yvl1e78evmwfs2mosyjb08rc")
export const SEED_API_KEY_ID = ApiKeyId("v42lqe92hgq2hpvilg91brnt")
export const SEED_DATASET_ID = DatasetId("m8k2p4r6t0v1w3x5y7z9a1b3")
export const SEED_DATASET_VERSION_ID = DatasetVersionId("v1a2b3c4d5e6f7g8h9i0j1k2")
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
export const SEED_SCORE_PASSED_ID = ScoreId("qfz1jxhx5p8gzukyz22tz5du")
export const SEED_SCORE_ERRORED_ID = ScoreId("araxu4s45cudpufdqiioo5a5")
export const SEED_SCORE_DRAFT_ID = ScoreId("n1hjgos7a7dxb61plvmiigcu")
export const SEED_SCORE_PENDING_ID = ScoreId("hiy75x2kq8hjhi27qkl9zaeb")
export const SEED_SCORE_ISSUE_LINKED_ID = ScoreId("qr25ftbv6q70ahxt690a7460")
export const SEED_SCORE_API_REVIEWED_ID = ScoreId("hvtb8yzxjjrudvhrme7aejiq")
export const SEED_EVALUATION_ID = EvaluationId("y0zr3gtsous6knd2qwdj1dit")
export const SEED_EVALUATION_ARCHIVED_ID = EvaluationId("hphb8g6uwzx68pfh9hzormqn")
export const SEED_ANNOTATION_QUEUE_ID = "w9pkzh13vu8ntru7ii5ved08"
export const SEED_ISSUE_ID = IssueId("dds0rt8sqgpuku4u4wabze9r")
export const SEED_ISSUE_UUID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
export const SEED_ANNOTATION_QUEUE_MANUAL_ID = AnnotationQueueId("w9pkzh13vu8ntru7ii5ved08")
export const SEED_ANNOTATION_QUEUE_SYSTEM_ID = AnnotationQueueId("aq2icpkri3o99sw0u24hy50w")
export const SEED_ANNOTATION_QUEUE_LIVE_ID = AnnotationQueueId("hikmfvizwaptzothgqtllelw")
export const SEED_ANNOTATION_QUEUE_ITEM_PENDING_ID = AnnotationQueueItemId("g7d3fimqkt51mrsf3gs4q8yx")
export const SEED_ANNOTATION_QUEUE_ITEM_COMPLETED_ID = AnnotationQueueItemId("w50qstqvujrivs8xreens7mt")
export const SEED_ANNOTATION_QUEUE_ITEM_SYSTEM_ID = AnnotationQueueItemId("txispc9i1qpx0vc2cbjrt4kx")
export const SEED_ANNOTATION_QUEUE_ITEM_LIVE_ID = AnnotationQueueItemId("tin3ni9h6aqwc0c4fcrkxxx7")
/** Additional queues for richer local/demo annotation-queue UI. */
export const SEED_ANNOTATION_QUEUE_REFUSAL_ID = AnnotationQueueId("b8c9d0e1f2g3h4i5j6k7l8m9")
export const SEED_ANNOTATION_QUEUE_WEEKLY_ID = AnnotationQueueId("n0o1p2q3r4s5t6u7v8w9x0y1")
export const SEED_ANNOTATION_QUEUE_ITEM_IN_PROGRESS_ID = AnnotationQueueItemId("z2a3b4c5d6e7f8g9h0i1j2k3")
export const SEED_ANNOTATION_QUEUE_ITEM_REFUSAL_A_ID = AnnotationQueueItemId("l4m5n6o7p8q9r0s1t2u3v4w5")
export const SEED_ANNOTATION_QUEUE_ITEM_REFUSAL_B_ID = AnnotationQueueItemId("x6y7z8a9b0c1d2e3f4g5h6i7")
export const SEED_ANNOTATION_QUEUE_ITEM_WEEKLY_A_ID = AnnotationQueueItemId("j8k9l0m1n2o3p4q5r6s7t8u9")
/** Manual queue with zero items — for empty-state UI. */
export const SEED_ANNOTATION_QUEUE_EMPTY_ID = AnnotationQueueId("e7m8p9q0r1s2t3u4v5w6x7y8")
export const SEED_ANNOTATION_QUEUE_ITEM_JAIL_444_ID = AnnotationQueueItemId("f1g2h3i4j5k6l7m8n9o0p1q2")
export const SEED_ANNOTATION_QUEUE_ITEM_LIVE_777_ID = AnnotationQueueItemId("r3s4t5u6v7w8x9y0z1a2b3c4")
export const SEED_ANNOTATION_QUEUE_ITEM_WEEKLY_B_ID = AnnotationQueueItemId("d5e6f7g8h9i0j1k2l3m4n5o6")
/** One queue with exactly pending / in progress / completed items for status UI demos. */
export const SEED_ANNOTATION_QUEUE_STATUS_DEMO_ID = AnnotationQueueId("kiecgrwfu0hta6cxtgt3eg1u")
export const SEED_ANNOTATION_QUEUE_ITEM_STATUS_PENDING_ID = AnnotationQueueItemId("a4mmcm5rvda0vr9o6vyman0u")
export const SEED_ANNOTATION_QUEUE_ITEM_STATUS_PROGRESS_ID = AnnotationQueueItemId("gqkjmzuhjydrk2hczkmljh9v")
export const SEED_ANNOTATION_QUEUE_ITEM_STATUS_COMPLETED_ID = AnnotationQueueItemId("h1kogt55m89gga64ywwqb097")
export const SEED_SIMULATION_ID = SimulationId("sim0k7x9g2m4n5p8q1r3s6t0")
export const SEED_SIMULATION_ERRORED_ID = SimulationId("sim1v2w3x4y5z6a7b8c9d0e1")
export const SEED_SCORE_SIMULATION_LINKED_ID = ScoreId("wk8m3p5r7t9v1x3z5b7d9f1h")

// Additional constants for seeding
export const SEED_ORG_NAME = "Acme Inc."
export const SEED_ORG_SLUG = "acme"
export const SEED_OWNER_EMAIL = "owner@acme.com"
export const SEED_ADMIN_EMAIL = "admin@acme.com"
export const SEED_PROJECT_NAME = "Default Project"
export const SEED_PROJECT_SLUG = "default-project"

/**
 * ClickHouse trace ids shared with Postgres score seeds and annotation-queue item seeds.
 * Span seed remaps the first N generated traces to these ids so list/detail UIs resolve real telemetry.
 */
export const SEED_CANONICAL_TRACE_IDS: readonly string[] = [
  "11111111111111111111111111111111",
  "22222222222222222222222222222222",
  "33333333333333333333333333333333",
  "66666666666666666666666666666666",
  "44444444444444444444444444444444",
  "55555555555555555555555555555555",
  "77777777777777777777777777777777",
]
