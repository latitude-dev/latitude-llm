import {
  datasetIdSchema,
  datasetVersionIdSchema,
  organizationIdSchema,
  projectIdSchema,
} from "@domain/shared"
import { Data } from "effect"
import { z } from "zod"

export const datasetSchema = z.object({
  id: datasetIdSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  name: z.string().min(1),
  description: z.string().nullable(),
  fileKey: z.string().nullable(),
  currentVersion: z.number().int().nonnegative(),
  latestVersionId: datasetVersionIdSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Dataset = z.infer<typeof datasetSchema>

export const datasetVersionSchema = z.object({
  id: datasetVersionIdSchema,
  datasetId: datasetIdSchema,
  version: z.number().int().positive(),
  rowsInserted: z.number().int().nonnegative(),
  rowsUpdated: z.number().int().nonnegative(),
  rowsDeleted: z.number().int().nonnegative(),
  source: z.string().min(1),
  actorId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type DatasetVersion = z.infer<typeof datasetVersionSchema>

export class DatasetNotFoundError extends Data.TaggedError("DatasetNotFoundError")<{
  readonly datasetId: string
}> {
  readonly httpStatus = 404
  get httpMessage() {
    return `Dataset ${this.datasetId} not found`
  }
}

export class DuplicateDatasetNameError extends Data.TaggedError("DuplicateDatasetNameError")<{
  readonly projectId: string
  readonly name: string
}> {
  readonly httpStatus = 409
  get httpMessage() {
    return `A dataset named "${this.name}" already exists in this project`
  }
}

export class TooManyTracesError extends Data.TaggedError("TooManyTracesError")<{
  readonly count: number
  readonly limit: number
}> {
  readonly httpStatus = 422
  get httpMessage() {
    return `Selection contains ${this.count} traces, but the limit is ${this.limit}`
  }
}
