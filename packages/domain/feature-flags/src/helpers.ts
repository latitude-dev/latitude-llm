import { Effect } from "effect"
import { FEATURE_FLAG_IDENTIFIER_MAX_LENGTH } from "./constants.ts"
import { InvalidFeatureFlagIdentifierError } from "./errors.ts"

export const normalizeFeatureFlagIdentifier = (identifier: string): string => identifier.trim()

export const validateFeatureFlagIdentifier = (
  identifier: string,
): Effect.Effect<string, InvalidFeatureFlagIdentifierError> => {
  const normalized = normalizeFeatureFlagIdentifier(identifier)

  if (normalized.length === 0) {
    return Effect.fail(new InvalidFeatureFlagIdentifierError({ identifier, reason: "Identifier cannot be empty" }))
  }

  if (normalized.length > FEATURE_FLAG_IDENTIFIER_MAX_LENGTH) {
    return Effect.fail(
      new InvalidFeatureFlagIdentifierError({
        identifier,
        reason: `Identifier exceeds ${FEATURE_FLAG_IDENTIFIER_MAX_LENGTH} characters`,
      }),
    )
  }

  return Effect.succeed(normalized)
}
