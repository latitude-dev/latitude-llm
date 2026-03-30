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
