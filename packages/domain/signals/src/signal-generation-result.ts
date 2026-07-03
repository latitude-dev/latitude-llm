export const SIGNAL_GENERATION_RESULT_TTL_SECONDS = 600

export const buildSignalGenerationResultKey = (organizationId: string, generationId: string): string =>
  `org:${organizationId}:signalGeneration:${generationId}`

export type SignalGenerationResult =
  | { readonly status: "pending"; readonly step?: string }
  | { readonly status: "done"; readonly signalId: string; readonly slug: string }
  | { readonly status: "error"; readonly error: string }
