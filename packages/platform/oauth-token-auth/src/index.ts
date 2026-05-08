// Re-export the prefix constants so consumers of this package get OAuth-token
// helpers from a single import path. The values themselves live in
// `@platform/db-postgres` next to the schema and adapter wrap (the prefix
// shape is tied to what's on disk, and `db-postgres` is the lower-level
// dependency — putting the constants here would create an import cycle).
export { OAUTH_ACCESS_TOKEN_PREFIX, OAUTH_REFRESH_TOKEN_PREFIX } from "@platform/db-postgres"
export {
  MIN_VALIDATION_TIME_MS,
  type OAuthTokenAuthResult,
  type ValidateOAuthAccessTokenDeps,
  validateOAuthAccessToken,
} from "./validate-oauth-token.ts"
