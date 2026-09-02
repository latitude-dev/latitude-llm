import { generateId, OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import type { GithubSignalReference } from "../entities/github-signal-reference.ts"
import type { GithubSignalReferenceRepositoryShape, GithubSignalReferenceUpsert } from "../ports/repositories.ts"

const naturalKeyMatch = (row: GithubSignalReference, reference: GithubSignalReferenceUpsert): boolean =>
  row.signalId === reference.signalId &&
  row.repoId === reference.repoId &&
  row.referenceType === reference.referenceType &&
  (reference.referenceType === "pull_request"
    ? row.prNumber === reference.prNumber
    : row.commitSha === reference.commitSha)

export const createFakeGithubSignalReferenceRepository = (init: {
  readonly organizationId: string
  readonly seed?: readonly GithubSignalReference[]
}) => {
  const rows = new Map<string, GithubSignalReference>()
  for (const row of init.seed ?? []) rows.set(row.id, row)

  const orgId = OrganizationId(init.organizationId)
  const inOrg = (): GithubSignalReference[] => [...rows.values()].filter((r) => r.organizationId === orgId)

  const repository: GithubSignalReferenceRepositoryShape = {
    upsert: (reference) =>
      Effect.sync(() => {
        const now = new Date()
        const existing = inOrg().find((r) => naturalKeyMatch(r, reference))
        const stored: GithubSignalReference = {
          id: existing?.id ?? generateId(),
          organizationId: orgId,
          projectId: reference.projectId,
          signalId: reference.signalId,
          integrationId: reference.integrationId,
          repoId: reference.repoId,
          repoFullName: reference.repoFullName,
          referenceType: reference.referenceType,
          prNumber: reference.prNumber,
          prState: reference.prState,
          commitSha: reference.commitSha,
          pushAfterSha: reference.pushAfterSha,
          title: reference.title,
          url: reference.url,
          authorLogin: reference.authorLogin,
          matchedSources: [...reference.matchedSources],
          action: reference.action,
          actionAppliedAt:
            existing && existing.action !== reference.action ? null : (existing?.actionAppliedAt ?? null),
          mergedAt: reference.mergedAt ?? existing?.mergedAt ?? null,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }
        rows.set(stored.id, stored)
        return stored
      }),

    listByPr: (input) =>
      Effect.sync(() =>
        inOrg().filter(
          (r) =>
            r.referenceType === "pull_request" &&
            r.repoId === input.repoId &&
            r.prNumber === input.prNumber &&
            (input.projectId ? r.projectId === input.projectId : true),
        ),
      ),

    listBySignal: (signalId) =>
      Effect.sync(() =>
        inOrg()
          .filter((r) => r.signalId === signalId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      ),

    findAbsorbableCommitReferences: (input) =>
      Effect.sync(() => {
        const shas = new Set([input.mergeCommitSha, input.headSha].filter((sha): sha is string => sha !== null))
        return inOrg().filter(
          (r) =>
            r.referenceType === "commit" &&
            r.repoId === input.repoId &&
            ((r.commitSha !== null && shas.has(r.commitSha)) ||
              (input.mergeCommitSha !== null && r.pushAfterSha === input.mergeCommitSha)),
        )
      }),

    setPrState: (input) =>
      Effect.sync(() => {
        for (const r of inOrg()) {
          if (r.referenceType === "pull_request" && r.repoId === input.repoId && r.prNumber === input.prNumber) {
            rows.set(r.id, {
              ...r,
              prState: input.prState,
              mergedAt: input.mergedAt ?? r.mergedAt,
              updatedAt: new Date(),
            })
          }
        }
      }),

    stampActionApplied: (input) =>
      Effect.sync(() => {
        const row = rows.get(input.id)
        if (row && row.organizationId === orgId) {
          rows.set(input.id, { ...row, actionAppliedAt: input.appliedAt, updatedAt: new Date() })
        }
      }),

    deleteById: (id) =>
      Effect.sync(() => {
        const row = rows.get(id)
        if (row && row.organizationId === orgId) rows.delete(id)
      }),

    deleteByProject: (projectId) =>
      Effect.sync(() => {
        for (const r of inOrg()) if (r.projectId === projectId) rows.delete(r.id)
      }),
  }

  return { repository, rows }
}
