import { z } from 'zod'

export const spansFiltersSchema = z
  .object({
    traceId: z.string().optional(),
    spanId: z.string().optional(),
    commitUuids: z.array(z.string()).optional(),
    experimentUuids: z.array(z.string()).optional(),
    createdAt: z
      .object({
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      })
      .optional(),
  })
  .loose() // Allow additional properties for future extensibility

export type SpansFilters = z.infer<typeof spansFiltersSchema>

/**
 * Parses and validates spans filters from a JSON string.
 * Returns undefined if parsing fails or validation fails.
 *
 * @param filtersParam - JSON string containing filters
 * @param context - Optional context for error logging
 * @returns Validated SpansFilters or undefined
 */
export function parseSpansFilters(
  filtersParam: string | null | undefined,
  context?: string,
): SpansFilters | undefined {
  if (!filtersParam) return undefined

  try {
    const parsedFilters = JSON.parse(filtersParam)
    const validatedFilters = spansFiltersSchema.parse(parsedFilters)
    return validatedFilters
  } catch (e) {
    console.warn(
      `Invalid filters parameter${context ? ` in ${context}` : ''}:`,
      e,
    )
    return undefined
  }
}
