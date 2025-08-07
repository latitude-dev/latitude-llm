export function parseSSE(data?: string): Record<string, string> | undefined {
  if (!data) return undefined

  const lines = data.split(/\r\n|\r|\n/)
  const event: Record<string, string> = {}
  let field = ''
  let value = ''

  for (const line of lines) {
    if (line.trim() === '') {
      // Empty line indicates the end of an event
      continue
    }

    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) {
      // Lines with no colon are treated as field names with empty values
      field = line
      value = ''
    } else if (colonIndex === 0) {
      // Lines starting with a colon are comments and should be ignored
      continue
    } else {
      field = line.slice(0, colonIndex)
      value = line.slice(colonIndex + 1).trim()
    }

    // Append the value if the field already exists
    if (event[field]) {
      event[field] += `\n${value}`
    } else {
      event[field] = value
    }
  }

  return Object.keys(event).length > 0 ? event : undefined
}
