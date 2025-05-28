import fs from 'fs'
import path from 'path'

const CODE_BLOCK_TYPE_BY_FILE_EXTENSION: Record<
  string,
  { lang: string; label: string }
> = {
  ts: { lang: 'typescript', label: 'Typescript' },
  py: { lang: 'python', label: 'Python' },
}

export function buildMarkdownDoc({
  examplePath,
}: {
  examplePath: string
}): string {
  const docPath = path.join(examplePath, 'doc.md')

  if (!fs.existsSync(docPath)) {
    throw new Error(`doc.md not found in ${examplePath}`)
  }

  let doc = fs.readFileSync(docPath, 'utf8')

  const promptFiles = fs
    .readdirSync(examplePath)
    .filter((f) => f.endsWith('.promptl'))
    .map((file) => ({
      name: file.replace(/\.promptl$/, ''), // name without extension
      content: fs.readFileSync(path.join(examplePath, file), 'utf8'),
    }))
    .sort((a, b) => {
      if (a.name === 'main') return -1 // "main" goes first
      if (b.name === 'main') return 1 // "main" goes first
      return a.name.localeCompare(b.name)
    })

  const promptsBlock =
    '<CodeGroup>\n' +
    promptFiles
      .map(
        ({ name, content }) =>
          `\`\`\`markdown ${name}\n${content.trim()}\n\`\`\``,
      )
      .join('\n') +
    '\n</CodeGroup>'

  const codeFiles = fs
    .readdirSync(examplePath)
    .filter((f) => f.endsWith('.py') || f.endsWith('.ts'))
    .sort((a, b) => {
      if (a.endsWith('.ts') && b.endsWith('.py')) return -1
      if (a.endsWith('.py') && b.endsWith('.ts')) return 1
      return a.localeCompare(b)
    })
    .map((file) => {
      const ext = path.extname(file).replace('.', '')
      return {
        ...CODE_BLOCK_TYPE_BY_FILE_EXTENSION[ext],
        content: fs.readFileSync(path.join(examplePath, file), 'utf8'),
      }
    })

  const codeBlock =
    '<CodeGroup>\n' +
    codeFiles
      .map(
        ({ lang, label, content }) =>
          `\`\`\`${lang} ${label}\n${content.trim()}\n\`\`\``,
      )
      .join('\n') +
    '\n</CodeGroup>'

  doc = doc.replace('[PROMPTS]', promptsBlock)
  doc = doc.replace('[CODE]', codeBlock)

  return doc
}
