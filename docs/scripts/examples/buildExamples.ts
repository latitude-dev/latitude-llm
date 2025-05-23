import fs from 'fs'
import path from 'path'

const CODE_BLOCK_TYPE_BY_FILE_EXTENSION: Record<
  string,
  { lang: string; label: string }
> = {
  ts: { lang: 'typescript', label: 'Typescript' },
  py: { lang: 'python', label: 'Python' },
}

export function buildDocs({ examplePath }: { examplePath: string }): string {
  const docPath = path.join(examplePath, 'doc.md')

  if (!fs.existsSync(docPath)) {
    throw new Error(`doc.md not found in ${examplePath}`)
  }

  let doc = fs.readFileSync(docPath, 'utf8')

  const folderName = path.basename(examplePath)

  // PROMPTL: One per file, named [folder]/example.promptl
  const promptFiles = fs
    .readdirSync(examplePath)
    .filter((f) => f.endsWith('.promptl'))
    .map((file) => ({
      name: `${folderName}/${file}`,
      content: fs.readFileSync(path.join(examplePath, file), 'utf8'),
    }))

  const promptsBlock =
    '<CodeGroup>\n' +
    promptFiles
      .map(
        ({ name, content }) =>
          `\`\`\`markdown ${name}\n${content.trim()}\n\`\`\``,
      )
      .join('\n') +
    '\n</CodeGroup>'

  // CODE: ts & py files with labels
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

function writeExampleDoc({ examplePath }: { examplePath: string }) {
  const markdown = buildDocs({ examplePath })
  const folderName = path.basename(examplePath)

  const outputDir = path.join(process.cwd(), 'docs', 'examples', 'sdk')
  const outputPath = path.join(outputDir, `${folderName}.mdx`)
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(outputPath, markdown)
  console.log(`✅ Wrote: ${outputPath}`)
}

const EXAMPLE_ROOT_PATH = path.join(
  process.cwd(),
  'examples',
  'src',
  'examples',
)
const runPromptExamplePath = path.join(EXAMPLE_ROOT_PATH, 'run-prompt')

writeExampleDoc({ examplePath: runPromptExamplePath })
