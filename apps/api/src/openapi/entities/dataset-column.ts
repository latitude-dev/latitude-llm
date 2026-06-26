import { BUILTIN_FIELDS, type DatasetColumn } from "@domain/datasets"
import { z } from "@hono/zod-openapi"

const DatasetColumnSourceSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("builtin").describe("A built-in field (`input`, `output`, `expectedOutput`, or `metadata`)."),
      field: z.enum(BUILTIN_FIELDS).describe("Which built-in field this column projects."),
    }),
    z.object({
      kind: z.literal("custom").describe("A user-added column; its values live under the row's `custom` store."),
    }),
  ])
  .describe("Where the column's values come from.")

export const DatasetColumnSchema = z
  .object({
    identifier: z
      .string()
      .describe("Stable, immutable column id. The key under which custom values are stored on each row."),
    name: z.string().describe("Display name. Editable; the identifier never changes."),
    source: DatasetColumnSourceSchema,
    removed: z
      .boolean()
      .optional()
      .describe(
        "`true` for soft-removed columns (only returned when listing with `includeRemoved`). Removed columns are excluded from rows and the default schema, but keep their data and can be restored.",
      ),
  })
  .openapi("DatasetColumn")

export const toDatasetColumnResponse = (column: DatasetColumn) => ({
  identifier: column.identifier,
  name: column.name,
  source: column.source,
  ...(column.removed ? { removed: true as const } : {}),
})
