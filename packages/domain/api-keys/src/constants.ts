export const DEFAULT_API_KEY_NAME = "Default API Key"

/**
 * Prefix applied to API keys minted under a Test Mode sandbox org
 * (`organizations.parent_org_id != null`). Purely cosmetic/observability so
 * sandbox keys are unmistakable in code, logs, and review — isolation is still
 * the org boundary (RLS + the `api_keys.organization_id` → org binding), never
 * this string. Live keys carry no prefix.
 */
export const SANDBOX_API_KEY_TOKEN_PREFIX = "lat_sandbox_"
