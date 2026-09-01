import { cuidSchema, organizationIdSchema, projectIdSchema } from "@domain/shared"
import { z } from "zod"
import { GITHUB_PR_STATES, GITHUB_REFERENCE_TYPES } from "../constants.ts"
import { githubMatchActionSchema, githubTextSourceSchema } from "../matching/types.ts"

export const githubReferenceTypeSchema = z.enum(GITHUB_REFERENCE_TYPES)
export type GithubReferenceType = z.infer<typeof githubReferenceTypeSchema>

export const githubPrStateSchema = z.enum(GITHUB_PR_STATES)
export type GithubPrState = z.infer<typeof githubPrStateSchema>

/**
 * A stored reference row (5.3): one signal ↔ one PR/commit. `prNumber`/`prState` are
 * set only for `pull_request` references; `commitSha`/`pushAfterSha` only for
 * `commit` references. `action` is the strongest matched intent; `actionAppliedAt`
 * is null until the lifecycle command actually ran. References are
 * historical records — applied ones are never deleted (D8).
 */
export const githubSignalReferenceSchema = z.object({
  id: cuidSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  signalId: cuidSchema,
  integrationId: cuidSchema,
  repoId: z.number().int().positive(),
  repoFullName: z.string(),
  referenceType: githubReferenceTypeSchema,
  prNumber: z.number().int().nullable(),
  prState: githubPrStateSchema.nullable(),
  commitSha: z.string().nullable(),
  pushAfterSha: z.string().nullable(),
  title: z.string(),
  url: z.string(),
  authorLogin: z.string().nullable(),
  matchedSources: z.array(githubTextSourceSchema),
  action: githubMatchActionSchema,
  actionAppliedAt: z.date().nullable(),
  mergedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type GithubSignalReference = z.infer<typeof githubSignalReferenceSchema>
