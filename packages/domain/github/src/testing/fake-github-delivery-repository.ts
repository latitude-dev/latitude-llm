import { generateId, OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import type { GithubDelivery } from "../entities/github-delivery.ts"
import type { GithubDeliveryRepositoryShape } from "../ports/repositories.ts"

export const createFakeGithubDeliveryRepository = (init: {
  readonly organizationId: string
  readonly seed?: readonly GithubDelivery[]
}) => {
  const rows = new Map<string, GithubDelivery>()
  for (const row of init.seed ?? []) rows.set(row.id, row)

  const orgId = OrganizationId(init.organizationId)
  const byDeliveryId = (deliveryId: string): GithubDelivery | undefined =>
    [...rows.values()].find((r) => r.deliveryId === deliveryId)

  const repository: GithubDeliveryRepositoryShape = {
    claim: (input) =>
      Effect.sync(() => {
        const existing = byDeliveryId(input.deliveryId)
        if (existing && existing.status !== null) return { claimed: false, id: null }
        const id = existing?.id ?? generateId()
        rows.set(id, {
          id,
          organizationId: orgId,
          integrationId: input.integrationId,
          deliveryId: input.deliveryId,
          event: input.event,
          action: input.action,
          repoId: input.repoId,
          status: null,
          skipReason: null,
          errorCategory: null,
          errorDetail: null,
          truncated: false,
          prNumber: null,
          mergeCommitSha: null,
          headSha: null,
          receivedAt: new Date(),
          processedAt: null,
        })
        return { claimed: true, id }
      }),

    finalize: (input) =>
      Effect.sync(() => {
        const row = rows.get(input.id)
        if (!row) return
        rows.set(input.id, {
          ...row,
          status: input.status,
          skipReason: input.skipReason ?? row.skipReason,
          errorCategory: input.errorCategory ?? row.errorCategory,
          errorDetail: input.errorDetail ?? row.errorDetail,
          truncated: input.truncated ?? row.truncated,
          prNumber: input.prNumber ?? row.prNumber,
          mergeCommitSha: input.mergeCommitSha ?? row.mergeCommitSha,
          headSha: input.headSha ?? row.headSha,
          processedAt: new Date(),
        })
      }),

    listRecentByOrganization: ({ limit, before }) =>
      Effect.sync(() =>
        [...rows.values()]
          .filter((r) => r.organizationId === orgId)
          .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime() || (a.id < b.id ? 1 : -1))
          .filter(
            (r) =>
              !before ||
              r.receivedAt.getTime() < before.receivedAt.getTime() ||
              (r.receivedAt.getTime() === before.receivedAt.getTime() && r.id < before.id),
          )
          .slice(0, limit),
      ),

    findMergeByShas: (input) =>
      Effect.sync(() => {
        const shas = new Set(input.shas)
        if (shas.size === 0) return null
        const match = [...rows.values()]
          .filter(
            (r) =>
              r.repoId === input.repoId &&
              r.prNumber !== null &&
              ((r.mergeCommitSha !== null && shas.has(r.mergeCommitSha)) ||
                (r.headSha !== null && shas.has(r.headSha))),
          )
          .sort((a, b) => (b.processedAt?.getTime() ?? 0) - (a.processedAt?.getTime() ?? 0))[0]
        if (!match || match.prNumber === null) return null
        return {
          deliveryId: match.deliveryId,
          prNumber: match.prNumber,
          mergeCommitSha: match.mergeCommitSha,
          headSha: match.headSha,
        }
      }),
  }

  return { repository, rows }
}
