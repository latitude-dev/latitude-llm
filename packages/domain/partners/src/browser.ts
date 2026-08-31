/**
 * Client entry for `@domain/partners`: only what the backoffice UI needs.
 *
 * The root barrel pulls in the ports and use-cases, which drag `@domain/users`,
 * `@domain/organizations` and the whole server graph into the client bundle.
 * Keep this file to pure values and types that erase.
 *
 * ⚠️ There is no `types` condition on this entry, so TypeScript resolves
 * `@domain/partners` to the root barrel either way: a symbol missing here still
 * typechecks and only fails at `pnpm build`.
 */
export {
  PARTNER_NAME_MAX_LENGTH,
  PARTNER_SCOPES,
  type Partner,
  type PartnerScope,
  partnerAllowedIpSchema,
  partnerIconUrlSchema,
  partnerRedirectUrlSchema,
  partnerScopeSchema,
} from "./entities/partner.ts"
export { isValidAllowlistEntry } from "./ip-allowlist.ts"
