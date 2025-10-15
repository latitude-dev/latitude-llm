export function parseMarkdownLinks(text: string | undefined) {
  if (!text) return ''
  return text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    `<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>`,
  )
}
