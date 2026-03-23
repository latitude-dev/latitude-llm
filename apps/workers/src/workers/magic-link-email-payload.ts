import type { MagicLinkEmailPayload } from "@platform/queue-bullmq"

function isValidMagicLinkEmailPayload(payload: unknown): payload is MagicLinkEmailPayload {
  if (payload === null || typeof payload !== "object") return false
  const value = payload as Record<string, unknown>
  if (typeof value.email !== "string") return false
  if (typeof value.magicLinkUrl !== "string") return false
  if (value.authIntentId !== null && typeof value.authIntentId !== "string") return false
  return true
}

export function parseMagicLinkEmailPayload(value: Uint8Array): MagicLinkEmailPayload | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(value))
    if (!isValidMagicLinkEmailPayload(parsed)) return null
    return parsed
  } catch {
    return null
  }
}
