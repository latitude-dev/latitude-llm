/** Cheap JSON detection to pick a syntax-highlight language for record bodies. */
export function looksLikeJson(body: string): boolean {
  const trimmed = body.trim()
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return false
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}
