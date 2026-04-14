import { OutboxEventWriter } from "@domain/events"
import { type DatasetId, type ProjectId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { validateDatasetNameInProject } from "./validate-dataset-name.ts"

export function createDataset(args: {
  readonly id?: DatasetId
  readonly projectId: ProjectId
  readonly name: string
  readonly description?: string
  readonly fileKey?: string
  readonly actorUserId?: string
}) {
  return Effect.gen(function* () {
    const sqlClient = yield* SqlClient
    const name = yield* validateDatasetNameInProject({
      projectId: args.projectId,
      name: args.name,
    })

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const repo = yield* DatasetRepository
        const dataset = yield* repo.create({ ...args, name })

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
      }),
    )
  })
}
