import { z } from "zod"
import type { AssessmentFindingChronology } from "../entities/session-assessment-input.ts"
import type { ResolvedAssessmentItem } from "../resolver/resolve-assessment-findings.ts"

const cursorPayloadSchema = z.object({
  version: z.literal(1),
  cutoff: z.iso.datetime(),
  occurredAt: z.iso.datetime().nullable(),
  messageIndex: z.number().int().nonnegative().nullable(),
  evidenceKey: z.string().min(1),
  itemId: z.string().min(1),
})

export type SessionAssessmentPageCursor = z.infer<typeof cursorPayloadSchema>

const encodeBase64Url = (value: string): string => {
  const bytes = new TextEncoder().encode(value)
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

const decodeBase64Url = (value: string): string => {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/")
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")
  const binary = atob(padded)
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))
}

export const encodeSessionAssessmentCursor = (input: {
  readonly cutoff: Date
  readonly lastItem: ResolvedAssessmentItem
}): string =>
  encodeBase64Url(
    JSON.stringify({
      version: 1,
      cutoff: input.cutoff.toISOString(),
      occurredAt: input.lastItem.chronology.occurredAt?.toISOString() ?? null,
      messageIndex: input.lastItem.chronology.messageIndex ?? null,
      evidenceKey: input.lastItem.item.evidenceKey,
      itemId: input.lastItem.item.id,
    } satisfies SessionAssessmentPageCursor),
  )

export const decodeSessionAssessmentCursor = (cursor: string): SessionAssessmentPageCursor | null => {
  try {
    const decoded = decodeBase64Url(cursor)
    const result = cursorPayloadSchema.safeParse(JSON.parse(decoded))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export const chronologyFromSessionAssessmentCursor = (
  cursor: SessionAssessmentPageCursor,
): AssessmentFindingChronology => ({
  ...(cursor.occurredAt ? { occurredAt: new Date(cursor.occurredAt) } : {}),
  ...(cursor.messageIndex !== null ? { messageIndex: cursor.messageIndex } : {}),
})
