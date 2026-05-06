import {
  MARKETING_FIELD_MAX_LENGTH,
  MarketingContactsError,
  type MarketingContactsPort,
  marketingCreateContactInputSchema,
  marketingUpdateContactInputSchema,
} from "@domain/marketing"
import { Effect } from "effect"
import { APIError, LoopsClient } from "loops"
import type { LoopsConfig } from "./config.ts"

type LoopsProperties = Record<string, string | number | boolean | null>

const sanitizeString = (value: string | null | undefined): string | undefined => {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.length > MARKETING_FIELD_MAX_LENGTH ? trimmed.slice(0, MARKETING_FIELD_MAX_LENGTH) : trimmed
}

const omitUndefined = (input: Record<string, string | number | boolean | null | undefined>): LoopsProperties => {
  const out: LoopsProperties = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

const isAlreadyOnListError = (error: unknown): boolean => {
  if (!(error instanceof APIError)) return false
  const message = error.json && "message" in error.json ? error.json.message : undefined
  if (typeof message !== "string") return false
  return /already on (the )?list/i.test(message)
}

const NOOP_SENDER: MarketingContactsPort = {
  createContact: () => Effect.void,
  updateContact: () => Effect.void,
}

const readUserId = (input: unknown): string => {
  if (input && typeof input === "object" && "userId" in input && typeof input.userId === "string") {
    return input.userId
  }
  return "unknown"
}

/**
 * Returns a real Loops adapter when config is present, or a no-op otherwise.
 * Local dev and self-hosted deployments typically run without
 * `LAT_LOOPS_API_KEY` — callers should neither check nor care which one
 * they got.
 */
export const createLoopsContactsSender = (config: LoopsConfig | undefined): MarketingContactsPort => {
  if (!config) return NOOP_SENDER

  const sdk = new LoopsClient(config.apiKey)

  return {
    createContact: (input) => {
      const result = marketingCreateContactInputSchema.safeParse(input)
      if (!result.success) {
        return Effect.fail(
          new MarketingContactsError({
            operation: "createContact",
            userId: readUserId(input),
            cause: result.error.issues[0],
          }),
        )
      }
      const parsed = result.data
      return Effect.tryPromise({
        try: () =>
          sdk.createContact({
            email: parsed.email,
            properties: omitUndefined({
              userId: parsed.userId,
              firstName: sanitizeString(parsed.firstName),
              source: parsed.source,
              subscribed: parsed.subscribed,
              createdAt: parsed.createdAt?.toISOString(),
            }),
          }),
        catch: (cause) =>
          new MarketingContactsError({
            operation: "createContact",
            userId: parsed.userId,
            cause,
          }),
      }).pipe(
        Effect.catchTag("MarketingContactsError", (error) =>
          isAlreadyOnListError(error.cause) ? Effect.void : Effect.fail(error),
        ),
        Effect.asVoid,
      )
    },

    updateContact: (input) => {
      const result = marketingUpdateContactInputSchema.safeParse(input)
      if (!result.success) {
        return Effect.fail(
          new MarketingContactsError({
            operation: "updateContact",
            userId: readUserId(input),
            cause: result.error.issues[0],
          }),
        )
      }
      const parsed = result.data
      return Effect.tryPromise({
        try: () =>
          sdk.updateContact({
            userId: parsed.userId,
            properties: omitUndefined({
              email: parsed.email,
              firstName: sanitizeString(parsed.firstName),
              jobTitle: sanitizeString(parsed.jobTitle),
              userGroup: parsed.userGroup,
              telemetryEnabled: parsed.telemetryEnabled,
            }),
          }),
        catch: (cause) =>
          new MarketingContactsError({
            operation: "updateContact",
            userId: parsed.userId,
            cause,
          }),
      }).pipe(Effect.asVoid)
    },
  }
}
