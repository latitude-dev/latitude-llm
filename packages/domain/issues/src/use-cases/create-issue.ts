import { cuidSchema, ProjectId, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import {
  CENTROID_EMBEDDING_DIMENSIONS,
  CENTROID_EMBEDDING_MODEL,
  CENTROID_HALF_LIFE_SECONDS,
  CENTROID_SOURCE_WEIGHTS,
} from "../constants.ts"
import type { Issue, IssueCentroid } from "../entities/issue.ts"
import { IssueRepository } from "../ports/issue-repository.ts"

/**
 * Create an empty centroid with default config values.
 * Used when creating a brand-new issue before any evidence has been contributed.
 */
const emptyIssueCentroid = (): IssueCentroid => ({
  base: new Array<number>(CENTROID_EMBEDDING_DIMENSIONS).fill(0),
  mass: 0,
  model: CENTROID_EMBEDDING_MODEL,
  decay: CENTROID_HALF_LIFE_SECONDS,
  weights: { ...CENTROID_SOURCE_WEIGHTS },
})
const createIssueInputSchema = z.object({
  projectId: cuidSchema.transform(ProjectId),
  name: z.string().min(1).max(128),
  description: z.string().default(""),
})

export type CreateIssueInput = z.input<typeof createIssueInputSchema>
export type CreateIssueError = RepositoryError

export const createIssueUseCase = (
  input: CreateIssueInput,
): Effect.Effect<Issue, CreateIssueError, IssueRepository | SqlClient> =>
  Effect.gen(function* () {
    const parsed = createIssueInputSchema.parse(input)
    const sqlClient = yield* SqlClient
    const repo = yield* IssueRepository

    return yield* repo.create({
      organizationId: sqlClient.organizationId,
      projectId: parsed.projectId,
      uuid: crypto.randomUUID(),
      name: parsed.name,
      description: parsed.description,
      centroid: emptyIssueCentroid(),
      clusteredAt: new Date(),
    })
  })
