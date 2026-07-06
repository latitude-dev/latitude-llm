/**
 * Capabilities drive runtime decisions (execution lane, metering, sampling,
 * retry policy) — never the script's origin. They are derived at compile time
 * for generated scripts and detected statically for raw scripts, overridable
 * by explicit declaration.
 */
export const SCRIPT_CAPABILITIES = ["llm", "embedding"] as const
export type ScriptCapability = (typeof SCRIPT_CAPABILITIES)[number]

const LLM_REFERENCE_PATTERN = /\bllm\s*\(/
const EMBEDDING_REFERENCE_PATTERN = /\bsemanticSimilarity\s*\(/

export const detectScriptCapabilities = (source: string): readonly ScriptCapability[] => {
  const capabilities: ScriptCapability[] = []
  if (LLM_REFERENCE_PATTERN.test(source)) capabilities.push("llm")
  if (EMBEDDING_REFERENCE_PATTERN.test(source)) capabilities.push("embedding")
  return capabilities
}

/** Whether a raw script source calls `semanticSimilarity()` and therefore needs message embeddings. */
export const requiresEmbedding = (source: string): boolean => EMBEDDING_REFERENCE_PATTERN.test(source)

export const resolveScriptCapabilities = (input: {
  readonly source: string
  readonly declared?: readonly ScriptCapability[] | undefined
}): readonly ScriptCapability[] => input.declared ?? detectScriptCapabilities(input.source)

export const hasLlmCapability = (capabilities: readonly ScriptCapability[]): boolean => capabilities.includes("llm")

export const hasEmbeddingCapability = (capabilities: readonly ScriptCapability[]): boolean =>
  capabilities.includes("embedding")
