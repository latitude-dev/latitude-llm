/**
 * Parses a ClickHouse DateTime64 string into a JavaScript Date object.
 * Handles both ISO format (with 'T' or 'Z') and ClickHouse format (space-separated).
 */
export function parseClickHouseDate(value: string): Date {
  if (value.includes('T') || value.includes('Z')) return new Date(value)
  return new Date(value.replace(' ', 'T') + 'Z')
}

/**
 * Converts a value to undefined if it's null, otherwise returns the value.
 * Useful for converting nullable database columns to optional TypeScript properties.
 */
export function orUndefined<T>(value: T | null): T | undefined {
  return value ?? undefined
}
