// Better Auth tables

// Domain tables
export * from "./api-keys.ts"
export * from "./auth-intent.ts"
export * from "./better-auth.ts"
export * from "./datasets.ts"
export * from "./datasetVersions.ts"
export * from "./grants.ts"
export * from "./outbox-events.ts"
export * from "./projects.ts"
export * from "./subscription.ts"

import * as apiKeys_ from "./api-keys.ts"
import * as authIntent from "./auth-intent.ts"
// Re-export all tables as a namespace for backward compatibility
import * as betterAuth from "./better-auth.ts"
import * as datasets_ from "./datasets.ts"
import * as datasetVersions_ from "./datasetVersions.ts"
import * as grants_ from "./grants.ts"
import * as outboxEvents from "./outbox-events.ts"
import * as projects_ from "./projects.ts"
import * as subscription from "./subscription.ts"

export const postgresSchema = {
  ...betterAuth,
  ...authIntent,
  ...subscription,
  ...apiKeys_,
  ...datasets_,
  ...datasetVersions_,
  ...grants_,
  ...outboxEvents,
  ...projects_,
}
