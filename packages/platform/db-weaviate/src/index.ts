export { InvalidEnvValueError, MissingEnvValueError } from "@platform/env"
export type { WeaviateClient } from "weaviate-client"
export type { CreateWeaviateClientError, WeaviateConfig } from "./client.ts"
export {
  createWeaviateClient,
  createWeaviateClientEffect,
  MissingWeaviateEndpointError,
  WeaviateConnectionError,
  WeaviateUnavailableError,
} from "./client.ts"
export { defaultWeaviateCollectionDefinitions } from "./collections.ts"
export type { WeaviateCollectionDefinition } from "./migrations.ts"
export { WeaviateCollectionMigrationError } from "./migrations.ts"
export { IssueProjectionRepositoryLive } from "./repositories/issue-projection-repository.ts"
