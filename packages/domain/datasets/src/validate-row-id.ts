import { type DatasetRowId, generateId, ValidationError } from "@domain/shared"
import { Effect } from "effect"

const MAX_ROW_ID_LENGTH = 128
const ROW_ID_PATTERN = /^[\w.~-]+$/

/**
 * Resolves and validates a row ID.
 *
 * When `id` is provided it is validated and returned as-is. This lets
 * callers supply their own stable identifiers (source DB primary keys,
 * UUIDs, composite keys, etc.) so that re-ingesting the same data
 * appends a new version instead of creating duplicate rows.
 *
 * When `id` is omitted a fresh CUID2 is generated automatically.
 *
 * Caller-provided ID constraints:
 *  - At most 128 characters
 *  - URL-safe: alphanumeric, hyphens, underscores, dots, tildes
 */
export function buildValidRowId(id?: DatasetRowId): Effect.Effect<DatasetRowId, ValidationError> {
  if (id === undefined) {
    return Effect.succeed(generateId<"DatasetRowId">())
  }

  if (id.length > MAX_ROW_ID_LENGTH) {
    return Effect.fail(
      new ValidationError({ field: "rowId", message: `Row ID must be at most ${MAX_ROW_ID_LENGTH} characters` }),
    )
  }

  if (!ROW_ID_PATTERN.test(id)) {
    return Effect.fail(
      new ValidationError({
        field: "rowId",
        message: "Row ID must contain only alphanumeric characters, hyphens, underscores, dots, or tildes",
      }),
    )
  }

  return Effect.succeed(id)
}
