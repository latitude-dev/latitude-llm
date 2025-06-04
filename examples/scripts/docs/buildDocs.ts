import fs from 'fs'
import path from 'path'
import { buildMarkdownDoc } from './buildMarkdown'

type MintlifyTab = {
  tab: string
  groups: { group: string; pages: string[] }[]
}
type MintylifyDocs = {
  navigation: {
    tabs: MintlifyTab[]
  }
}
function getFolderName(pagePath: string) {
  return pagePath.split('/').pop()
}

function writeDocs({
  type,
  mintlify,
  inputPath,
  outputDir,
  folderListOrdered,
}: {
  type: 'sdk' | 'cases'
  mintlify: {
    path: string
    sidebarGroupName: string
  }
  inputPath: string
  outputDir: string
  folderListOrdered: string[]
}) {
  fs.mkdirSync(outputDir, { recursive: true })

  const folders = fs
    .readdirSync(inputPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  const orderedFolders = [
    ...folderListOrdered.filter((name) => folders.includes(name)),
    ...folders.filter((name) => !folderListOrdered.includes(name)),
  ]

  const navPaths: string[] = []

  orderedFolders.forEach((folderName) => {
    const examplePath = path.join(inputPath, folderName)
    const outputPath = path.join(outputDir, `${folderName}.mdx`)

    try {
      const markdown = buildMarkdownDoc({ examplePath })
      fs.writeFileSync(outputPath, markdown)
      navPaths.push(`examples/${type}/${folderName}`)
    } catch (err) {
      console.warn(`⚠️ Skipped ${folderName}: ${err}`)
    }
  })

  if (!fs.existsSync(mintlify.path)) {
    console.error('❌ docs/docs.json Mintlify config not found')
    process.exit(1)
  }

  const mintJson = JSON.parse(
    fs.readFileSync(mintlify.path, 'utf8'),
  ) as MintylifyDocs
  const examplesTab = mintJson.navigation.tabs.find(
    ({ tab }) => tab === 'Examples',
  )
  const pageGroup = examplesTab.groups.find(
    ({ group }) => group === mintlify.sidebarGroupName,
  )

  if (!pageGroup) {
    console.log(
      `"${mintlify.sidebarGroupName}" section not found in docs/docs.json`,
    )
  }

  const uniquePages = Array.from(new Set([...pageGroup.pages, ...navPaths]))
  const folderOrderMap = Object.fromEntries(
    folderListOrdered.map((name, i) => [name, i]),
  )
  uniquePages.sort((a, b) => {
    const aIndex = folderOrderMap[getFolderName(a)]
    const bIndex = folderOrderMap[getFolderName(b)]
    if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex
    if (aIndex !== undefined) return -1
    if (bIndex !== undefined) return 1
    return 0
  })
  pageGroup.pages = uniquePages
  fs.writeFileSync(mintlify.path, JSON.stringify(mintJson, null, 2))
}

function writeAllExampleDocsAndUpdateMintJson() {
  const EXAMPLES_SRC_PATH = path.join(process.cwd(), 'examples', 'src')
  const DOCS_BASE_PATH = path.join(process.cwd(), 'docs')
  const MINT_JSON_PATH = path.join(DOCS_BASE_PATH, 'docs.json')
  const DOCS_EXAMPLES_BASE_PATH = path.join(DOCS_BASE_PATH, 'examples')

  writeDocs({
    type: 'sdk',
    mintlify: { path: MINT_JSON_PATH, sidebarGroupName: 'SDK examples' },
    inputPath: path.join(EXAMPLES_SRC_PATH, 'sdk'),
    outputDir: path.join(DOCS_EXAMPLES_BASE_PATH, 'sdk'),
    folderListOrdered: [
      'run-prompt',
      'run-prompt-with-tools',
      'pause-tool',
      'get-prompt',
      'get-or-create-prompt',
      'get-all-prompts',
      'create-log',
    ],
  })

  writeDocs({
    type: 'cases',
    mintlify: { path: MINT_JSON_PATH, sidebarGroupName: 'Use cases' },
    inputPath: path.join(EXAMPLES_SRC_PATH, 'cases'),
    outputDir: path.join(DOCS_EXAMPLES_BASE_PATH, 'cases'),
    folderListOrdered: [
      'weather-chatbot',
      'joke-generator',
      'deep-search',
      'customer-support-email',
    ],
  })
}

writeAllExampleDocsAndUpdateMintJson()
