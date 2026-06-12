import { AIEmbed, type AIEmbedShape, AIRerank, type AIRerankShape } from "@domain/ai"
import { embedWithVercel, rerankWithVercel } from "@platform/ai-vercel"
import { embedWithVoyage, rerankWithVoyage } from "@platform/ai-voyage"
import { Layer } from "effect"

// The three AI layers apps wire, packed together: generation comes straight
// from the Vercel AI SDK adapter (it speaks every generation provider), while
// the embedding and reranking layers route per call on `input.provider` —
// `voyage` goes to the native Voyage SDK adapter, every other provider to the
// Vercel AI SDK adapter. Apps wire these instead of a concrete adapter so the
// provider stays a runtime (LAT_AI_*) decision.

export { AIGenerateLive } from "@platform/ai-vercel"

export const AIEmbedLive = Layer.succeed(AIEmbed, {
  embed: (input) => (input.provider === "voyage" ? embedWithVoyage(input) : embedWithVercel(input)),
} satisfies AIEmbedShape)

export const AIRerankLive = Layer.succeed(AIRerank, {
  rerank: (input) => (input.provider === "voyage" ? rerankWithVoyage(input) : rerankWithVercel(input)),
} satisfies AIRerankShape)
