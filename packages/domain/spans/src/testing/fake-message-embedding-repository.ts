import { Effect } from "effect"
import type { MessageEmbeddingRepositoryShape, MessageEmbeddingUpsert } from "../ports/message-embedding-repository.ts"

export const createFakeMessageEmbeddingRepository = (overrides?: Partial<MessageEmbeddingRepositoryShape>) => {
  const upserted: MessageEmbeddingUpsert[][] = []

  const repository: MessageEmbeddingRepositoryShape = {
    findByHashes: () => Effect.succeed([]),
    upsertMany: (rows) => {
      upserted.push([...rows])
      return Effect.void
    },
    ...overrides,
  }

  return { repository, upserted }
}
