import { z } from "zod"

export const SIGNAL_VISUAL_ID_PREFIX = "LAT"

const SIGNAL_VISUAL_ID_SUFFIX_PATTERN = /\d{3,}/

export const signalVisualIdSchema = z
  .string()
  .regex(/^LAT-\d{3,}$/i, "Expected a signal visual id like LAT-001")
  .transform((value) => value.toUpperCase())

export type SignalVisualId = z.infer<typeof signalVisualIdSchema>

export const SIGNAL_VISUAL_ID_MENTION_PATTERN = /\bLAT-\d{3,}\b/gi

export function formatSignalVisualId(sequence: number): SignalVisualId {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Invalid signal visual id sequence: ${sequence}`)
  }

  const suffix = sequence < 1000 ? String(sequence).padStart(3, "0") : String(sequence)
  if (!SIGNAL_VISUAL_ID_SUFFIX_PATTERN.test(suffix)) {
    throw new Error(`Invalid signal visual id suffix: ${suffix}`)
  }

  return signalVisualIdSchema.parse(`${SIGNAL_VISUAL_ID_PREFIX}-${suffix}`)
}

export function isSignalVisualId(value: string): value is SignalVisualId {
  return signalVisualIdSchema.safeParse(value).success
}

export function extractSignalVisualIds(text: string): readonly SignalVisualId[] {
  const matches = text.match(SIGNAL_VISUAL_ID_MENTION_PATTERN) ?? []
  return [...new Set(matches.map((match) => signalVisualIdSchema.parse(match)))]
}
