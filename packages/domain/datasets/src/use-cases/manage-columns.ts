import { type DatasetId, generateId, ValidationError } from "@domain/shared"
import { Effect } from "effect"
import { effectiveColumns, materializeColumns } from "../columns.ts"
import type { DatasetColumn } from "../entities/dataset.ts"
import { DatasetColumnNotFoundError } from "../errors.ts"
import { DatasetRepository } from "../ports/dataset-repository.ts"

export const listColumns = Effect.fn("datasets.listColumns")(function* (args: {
  readonly datasetId: DatasetId
  readonly includeRemoved?: boolean
}) {
  yield* Effect.annotateCurrentSpan("datasetId", args.datasetId)
  const repo = yield* DatasetRepository
  const dataset = yield* repo.findById(args.datasetId)
  return args.includeRemoved ? materializeColumns(dataset.columns) : effectiveColumns(dataset.columns)
})

const validateName = (name: string) =>
  Effect.gen(function* () {
    const trimmed = name.trim()
    if (trimmed === "") {
      return yield* new ValidationError({ field: "name", message: "Column name cannot be empty" })
    }
    return trimmed
  })

export const addColumn = Effect.fn("datasets.addColumn")(function* (args: {
  readonly datasetId: DatasetId
  readonly name: string
}) {
  yield* Effect.annotateCurrentSpan("datasetId", args.datasetId)
  const repo = yield* DatasetRepository
  const dataset = yield* repo.findById(args.datasetId)
  const name = yield* validateName(args.name)

  const column: DatasetColumn = {
    identifier: generateId(),
    name,
    source: { kind: "custom" },
  }
  const columns = [...materializeColumns(dataset.columns), column]
  yield* repo.updateColumns({ id: args.datasetId, columns })
  return column
})

export const updateColumn = Effect.fn("datasets.updateColumn")(function* (args: {
  readonly datasetId: DatasetId
  readonly identifier: string
  readonly name: string
}) {
  yield* Effect.annotateCurrentSpan("datasetId", args.datasetId)
  const repo = yield* DatasetRepository
  const dataset = yield* repo.findById(args.datasetId)

  const current = materializeColumns(dataset.columns)
  const target = current.find((c) => c.identifier === args.identifier && !c.removed)
  if (!target) {
    return yield* new DatasetColumnNotFoundError({ datasetId: args.datasetId, identifier: args.identifier })
  }

  const name = yield* validateName(args.name)
  const updated: DatasetColumn = { ...target, name }
  const columns = current.map((c) => (c.identifier === args.identifier ? updated : c))
  yield* repo.updateColumns({ id: args.datasetId, columns })
  return updated
})

export const reorderColumns = Effect.fn("datasets.reorderColumns")(function* (args: {
  readonly datasetId: DatasetId
  readonly order: readonly string[]
}) {
  yield* Effect.annotateCurrentSpan("datasetId", args.datasetId)
  const repo = yield* DatasetRepository
  const dataset = yield* repo.findById(args.datasetId)

  const current = materializeColumns(dataset.columns)
  const byId = new Map(current.map((c) => [c.identifier, c]))
  const seen = new Set<string>()
  const reordered: DatasetColumn[] = []
  for (const id of args.order) {
    const col = byId.get(id)
    if (col && !seen.has(id)) {
      reordered.push(col)
      seen.add(id)
    }
  }
  // Append any column the caller omitted (including soft-removed ones), preserving relative order.
  for (const col of current) {
    if (!seen.has(col.identifier)) reordered.push(col)
  }

  yield* repo.updateColumns({ id: args.datasetId, columns: reordered })
  return reordered
})

export const removeColumn = Effect.fn("datasets.removeColumn")(function* (args: {
  readonly datasetId: DatasetId
  readonly identifier: string
}) {
  yield* Effect.annotateCurrentSpan("datasetId", args.datasetId)
  const repo = yield* DatasetRepository
  const dataset = yield* repo.findById(args.datasetId)

  const current = materializeColumns(dataset.columns)
  const target = current.find((c) => c.identifier === args.identifier && !c.removed)
  if (!target) {
    return yield* new DatasetColumnNotFoundError({ datasetId: args.datasetId, identifier: args.identifier })
  }

  // Soft-delete (built-in or custom): keep the descriptor and its position so it can be re-added with
  // its data intact. Built-in row fields are never erased — only excluded from the active schema.
  const columns = current.map((c) => (c.identifier === args.identifier ? { ...c, removed: true } : c))
  yield* repo.updateColumns({ id: args.datasetId, columns })
})

export const restoreColumn = Effect.fn("datasets.restoreColumn")(function* (args: {
  readonly datasetId: DatasetId
  readonly identifier: string
}) {
  yield* Effect.annotateCurrentSpan("datasetId", args.datasetId)
  const repo = yield* DatasetRepository
  const dataset = yield* repo.findById(args.datasetId)

  const current = materializeColumns(dataset.columns)
  const target = current.find((c) => c.identifier === args.identifier && c.removed === true)
  if (!target) {
    return yield* new DatasetColumnNotFoundError({ datasetId: args.datasetId, identifier: args.identifier })
  }

  const restored: DatasetColumn = { ...target, removed: false }
  const columns = current.map((c) => (c.identifier === args.identifier ? restored : c))
  yield* repo.updateColumns({ id: args.datasetId, columns })
  return restored
})
