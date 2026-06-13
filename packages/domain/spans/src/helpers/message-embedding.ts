import { type CryptoError, hash } from "@repo/utils"
import type { Effect } from "effect"

export type MessageEmbeddingRole = "user" | "assistant" | "tool" | "system" | "unknown"

export interface MessageEmbeddingInput {
  readonly role: MessageEmbeddingRole
  readonly text: string
}

export const canonicalizeMessageForEmbedding = (message: MessageEmbeddingInput): string =>
  `${message.role}: ${message.text}`

export const hashMessageContent = (message: MessageEmbeddingInput): Effect.Effect<string, CryptoError> =>
  hash(canonicalizeMessageForEmbedding(message))
