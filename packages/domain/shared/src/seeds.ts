import {
  ApiKeyId,
  DatasetId,
  DatasetVersionId,
  GrantId,
  MembershipId,
  OrganizationId,
  ProjectId,
  SubscriptionId,
  UserId,
} from "./id.ts"

// Constants for seeding the database with initial data
export const SEED_ORG_ID = OrganizationId("iapkf6osmlm7mbw9kulosua4")
export const SEED_SUBSCRIPTION_ID = SubscriptionId("ry0fy0n6qwszk3kk04zlfsuy")
export const SEED_GRANT_SEATS_ID = GrantId("nkbbtxd5o7rbrr8miamhrnif")
export const SEED_GRANT_RUNS_ID = GrantId("drkvcpudmblnqxgk48irmt94")
export const SEED_OWNER_USER_ID = UserId("ye9d77pxi50nh1gyqljkffnb")
export const SEED_ADMIN_USER_ID = UserId("uzm4d8pb5k0bd2oug9ud2xjs")
export const SEED_PROJECT_ID = ProjectId("yvl1e78evmwfs2mosyjb08rc")
export const SEED_API_KEY_ID = ApiKeyId("v42lqe92hgq2hpvilg91brnt")
export const SEED_DATASET_ID = DatasetId("m8k2p4r6t0v1w3x5y7z9a1b3")
export const SEED_DATASET_VERSION_ID = DatasetVersionId("v1a2b3c4d5e6f7g8h9i0j1k2")
export const SEED_OWNER_MEMBERSHIP_ID = MembershipId("bg5hvjzpeop0atmz2nqydas7")
export const SEED_ADMIN_MEMBERSHIP_ID = MembershipId("h5q2nionpzqmzvkgp0sp7jnl")

// Additional constants for seeding
export const SEED_ORG_NAME = "Acme Inc."
export const SEED_ORG_SLUG = "acme"
export const SEED_OWNER_EMAIL = "owner@acme.com"
export const SEED_ADMIN_EMAIL = "admin@acme.com"
export const SEED_PROJECT_NAME = "Default Project"
export const SEED_PROJECT_SLUG = "default-project"
