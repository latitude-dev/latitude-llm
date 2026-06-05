import { useQuery } from "@tanstack/react-query"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import { useAuthenticatedOrganizationId } from "../../routes/_authenticated/-route-data.ts"
import type { SsoDomainVerificationRecordDto, SsoProviderDto } from "./sso.functions.ts"
import {
  deleteSsoProvider,
  getOrgSsoProvider,
  getSsoDomainVerificationRecord,
  registerSsoProvider,
  updateSsoEnforcement,
  verifySsoDomain,
} from "./sso.functions.ts"

const queryClient = getQueryClient()

const SSO_PROVIDER_QUERY_KEY = ["sso", "provider"] as const

const getSsoProviderQueryKey = (organizationId: string) => [...SSO_PROVIDER_QUERY_KEY, organizationId]

export function useOrgSsoProvider(): { provider: SsoProviderDto | null | undefined; isLoading: boolean } {
  const organizationId = useAuthenticatedOrganizationId()
  const { data, isLoading } = useQuery({
    queryKey: getSsoProviderQueryKey(organizationId),
    queryFn: () => getOrgSsoProvider(),
  })
  return { provider: data, isLoading }
}

const invalidateSsoProvider = async (): Promise<void> => {
  await queryClient.invalidateQueries({ queryKey: SSO_PROVIDER_QUERY_KEY })
}

type RegisterSsoProviderInput =
  | { kind: "saml"; domain: string; issuer: string; entryPoint: string; idpCert: string }
  | { kind: "oidc"; domain: string; issuer: string; clientId: string; clientSecret: string }

export async function registerSsoProviderMutation(
  input: RegisterSsoProviderInput,
): Promise<{ provider: SsoProviderDto; verificationRecord: SsoDomainVerificationRecordDto }> {
  const result = await registerSsoProvider({ data: input })
  await invalidateSsoProvider()
  return result
}

export async function getSsoDomainVerificationRecordMutation(): Promise<SsoDomainVerificationRecordDto> {
  return await getSsoDomainVerificationRecord()
}

export async function verifySsoDomainMutation(): Promise<{ verified: boolean; message?: string }> {
  const result = await verifySsoDomain()
  if (result.verified) await invalidateSsoProvider()
  return result
}

export async function updateSsoEnforcementMutation(enforced: boolean): Promise<void> {
  await updateSsoEnforcement({ data: { enforced } })
  await invalidateSsoProvider()
}

export async function deleteSsoProviderMutation(): Promise<void> {
  await deleteSsoProvider()
  await invalidateSsoProvider()
}
