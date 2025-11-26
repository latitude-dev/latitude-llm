/**
 * Format a date as "YYYY-MM-DD HH:MM:SS"
 */
export function formatDateTime(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 19)
}

/**
 * Format a date as "YYYY/MM/DD"
 */
export function formatDateShort(date: Date): string {
  return date.toISOString().split('T')[0]!.replace(/-/g, '/')
}
