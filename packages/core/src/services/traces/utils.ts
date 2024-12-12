export function tryParseJSON(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return content
  }
}
