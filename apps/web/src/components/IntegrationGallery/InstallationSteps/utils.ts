export function withIndent(code: string, indent: number) {
  return code
    .split('\n')
    .map((line) => `  `.repeat(indent) + line)
    .join('\n')
}

