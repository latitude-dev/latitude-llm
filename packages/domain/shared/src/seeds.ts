import {
  ApiKeyId,
  DatasetId,
  DatasetVersionId,
  IssueId,
  MembershipId,
  OrganizationId,
  ProjectId,
  ScoreId,
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
export const SEED_EVALUATION_ID = "y0zr3gtsous6knd2qwdj1dit"
export const SEED_ANNOTATION_QUEUE_ID = "w9pkzh13vu8ntru7ii5ved08"
export const SEED_ISSUE_ID = IssueId("dds0rt8sqgpuku4u4wabze9r")
export const SEED_ISSUE_UUID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"

// Additional constants for seeding
export const SEED_ORG_NAME = "Acme Inc."
export const SEED_ORG_SLUG = "acme"
export const SEED_OWNER_EMAIL = "owner@acme.com"
export const SEED_ADMIN_EMAIL = "admin@acme.com"
export const SEED_PROJECT_NAME = "Default Project"
export const SEED_PROJECT_SLUG = "default-project"
