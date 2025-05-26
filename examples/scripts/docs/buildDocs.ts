import fs from 'fs'
import path from 'path'
import { buildMarkdownDoc } from './buildMarkdown'

// We specify these examples first because are the basics
const SDK_EXAMPLES_ORDER = [
  'run-prompt',
  'run-prompt-with-tools',
  'pause-tool',
  'get-prompt',
  'get-or-create-prompt',
  'get-all-prompts',
  'create-log',
]

function writeAllExampleDocsAndUpdateMintJson() {
  const EXAMPLE_ROOT_PATH = path.join(
    process.cwd(),
    'examples',
    'src',
    'examples',
  )
  const OUTPUT_DIR = path.join(process.cwd(), 'docs', 'examples', 'sdk')
  const MINT_JSON_PATH = path.join(process.cwd(), 'docs', 'mint.json')

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const folders = fs
    .readdirSync(EXAMPLE_ROOT_PATH, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  const orderedFolders = [
    ...SDK_EXAMPLES_ORDER.filter((name) => folders.includes(name)),
    ...folders.filter((name) => !SDK_EXAMPLES_ORDER.includes(name)),
  ]

  const navPaths: string[] = []

  orderedFolders.forEach((folderName) => {
    const examplePath = path.join(EXAMPLE_ROOT_PATH, folderName)
    const outputPath = path.join(OUTPUT_DIR, `${folderName}.mdx`)

    try {
      const markdown = buildMarkdownDoc({ examplePath })
      fs.writeFileSync(outputPath, markdown)
      navPaths.push(`/examples/sdk/${folderName}`)
    } catch (err) {
      console.warn(`⚠️ Skipped ${folderName}: ${err}`)
    }
  })

  if (!fs.existsSync(MINT_JSON_PATH)) {
    console.error('❌ mint.json not found')
    process.exit(1)
  }

  const mintJson = JSON.parse(fs.readFileSync(MINT_JSON_PATH, 'utf8'))
  const examplesPages = mintJson.navigation.find(
    (item: { group: string }) => item.group === 'SDK examples',
  ) as { group: string; pages: string[] }

  if (!examplesPages) {
    console.log('"SDK examples" section not found in docs/mint.json')
  }

  examplesPages.pages = navPaths
  fs.writeFileSync(MINT_JSON_PATH, JSON.stringify(mintJson, null, 2))
}

writeAllExampleDocsAndUpdateMintJson()
