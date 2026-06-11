/**
 * Capabilities drive runtime decisions (execution lane, metering, sampling,
 * retry policy) — never the script's origin. They are derived at compile time
 * for generated scripts and detected statically for raw scripts, overridable
 * by explicit declaration.
 */
export const SCRIPT_CAPABILITIES = ["llm"] as const
export type ScriptCapability = (typeof SCRIPT_CAPABILITIES)[number]

const LLM_REFERENCE_PATTERN = /\bllm\s*\(/

export const detectScriptCapabilities = (source: string): readonly ScriptCapability[] =>
  LLM_REFERENCE_PATTERN.test(source) ? ["llm"] : []

export const resolveScriptCapabilities = (input: {
  readonly source: string
  readonly declared?: readonly ScriptCapability[] | undefined
}): readonly ScriptCapability[] => input.declared ?? detectScriptCapabilities(input.source)

export const hasLlmCapability = (capabilities: readonly ScriptCapability[]): boolean => capabilities.includes("llm")
