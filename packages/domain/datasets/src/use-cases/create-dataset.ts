import { OutboxEventWriter } from "@domain/events"
import { type DatasetId, generateSlug, type ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { validateDatasetNameInProject } from "./validate-dataset-name.ts"

export const createDataset = Effect.fn("datasets.createDataset")(function* (args: {
  readonly id?: DatasetId
  readonly projectId: ProjectId
  readonly name: string
  readonly description?: string
  readonly fileKey?: string
  readonly actorUserId?: string
}) {
  yield* Effect.annotateCurrentSpan("projectId", args.projectId)

  const repo = yield* DatasetRepository
  const name = yield* validateDatasetNameInProject({
    projectId: args.projectId,
    name: args.name,
  })
  const slug = yield* generateSlug({
    name,
    count: (slug) => repo.countBySlug({ projectId: args.projectId, slug }),
  })
  const dataset = yield* repo.create({ ...args, name, slug })

  const outboxEventWriter = yield* OutboxEventWriter
  yield* outboxEventWriter.write({
    eventName: "DatasetCreated",
    aggregateType: "dataset",
    aggregateId: dataset.id,
    organizationId: dataset.organizationId,
    payload: {
      organizationId: dataset.organizationId,
      actorUserId: args.actorUserId ?? "",
      projectId: dataset.projectId,
      datasetId: dataset.id,
      name: dataset.name,
    },
  })

  return dataset
})
