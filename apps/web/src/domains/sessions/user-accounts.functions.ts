import { UnauthorizedError } from "@domain/shared"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { z } from "zod"
import { getBetterAuth } from "../../server/clients.ts"

export const SOCIAL_PROVIDER_IDS = ["google", "github"] as const
export type SocialProviderId = (typeof SOCIAL_PROVIDER_IDS)[number]

export interface UserAccountProfile {
  readonly name: string | null
  readonly email: string | null
  readonly image: string | null
}

export interface UserAccountDto {
  readonly id: string
  readonly providerId: string
  readonly accountId: string
  readonly createdAt: string
  readonly profile: UserAccountProfile | null
}

const asIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString()

export const listUserAccounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<readonly UserAccountDto[]> => {
    const headers = getRequestHeaders()
    const auth = getBetterAuth()

    const session = await auth.api.getSession({ headers })
    if (!session) throw new UnauthorizedError({ message: "Unauthorized" })

    const rows = await auth.api.listUserAccounts({ headers })
    return await Promise.all(
      rows.map(async (row) => {
        let profile: UserAccountProfile | null = null
        try {
          const info = await auth.api.accountInfo({
            headers,
            query: { accountId: row.accountId },
          })
          if (info?.user) {
            profile = {
              name: info.user.name ?? null,
              email: info.user.email ?? null,
              image: info.user.image ?? null,
            }
          }
        } catch {}
        return {
          id: row.id,
          providerId: row.providerId,
          accountId: row.accountId,
          createdAt: asIso(row.createdAt),
          profile,
        }
      }),
    )
  },
)

export const unlinkUserAccount = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      providerId: z.enum(SOCIAL_PROVIDER_IDS),
      accountId: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<{ readonly success: true }> => {
    const headers = getRequestHeaders()
    const auth = getBetterAuth()

    const session = await auth.api.getSession({ headers })
    if (!session) throw new UnauthorizedError({ message: "Unauthorized" })

    await auth.api.unlinkAccount({
      headers,
      body: { providerId: data.providerId, accountId: data.accountId },
    })
    return { success: true }
  })
