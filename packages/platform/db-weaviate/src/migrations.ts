import { Data, Effect } from "effect"
import type { WeaviateClient } from "weaviate-client"

type WeaviateCollectionCreateInput = Parameters<WeaviateClient["collections"]["create"]>[0]

export type WeaviateCollectionDefinition = Readonly<
  WeaviateCollectionCreateInput & {
    readonly name: string
  }
>

export class WeaviateCollectionMigrationError extends Data.TaggedError("WeaviateCollectionMigrationError")<{
  readonly collectionName: string
  readonly operation: "exists" | "create"
  readonly message: string
}> {}

const formatUnknownError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

const isCollectionAlreadyExistsError = (error: unknown): boolean => {
  const message = formatUnknownError(error).toLowerCase()
  return message.includes("already exists")
}

export const defineWeaviateCollections = <TDefinitions extends readonly WeaviateCollectionDefinition[]>(
  definitions: TDefinitions,
): TDefinitions => definitions

export const migrateWeaviateCollectionsEffect = (
  client: WeaviateClient,
  definitions: readonly WeaviateCollectionDefinition[],
): Effect.Effect<void, WeaviateCollectionMigrationError> => {
  return Effect.gen(function* () {
    for (const definition of definitions) {
      const exists = yield* Effect.tryPromise({
        try: () => client.collections.exists(definition.name),
        catch: (error) =>
          new WeaviateCollectionMigrationError({
            collectionName: definition.name,
            operation: "exists",
            message: formatUnknownError(error),
          }),
      })

      if (exists) {
        continue
      }

      yield* Effect.tryPromise({
        try: async () => {
          try {
            await client.collections.create(definition)
          } catch (error) {
            if (isCollectionAlreadyExistsError(error)) {
              return
            }

            throw error
          }
        },
        catch: (error) =>
          new WeaviateCollectionMigrationError({
            collectionName: definition.name,
            operation: "create",
            message: formatUnknownError(error),
          }),
      })
    }
  })
}
