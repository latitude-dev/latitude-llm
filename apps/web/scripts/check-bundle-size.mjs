import { readdir, stat } from "node:fs/promises"
import path from "node:path"

const MAX_SIZE_BYTES = 500 * 1024
const assetsDir = path.resolve(process.cwd(), ".output/public/assets")

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)))
      continue
    }

    files.push(fullPath)
  }

  return files
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`
}

async function main() {
  const files = await collectFiles(assetsDir)
  const oversized = []

  for (const file of files) {
    if (!file.endsWith(".js")) {
      continue
    }

    const fileStats = await stat(file)
    if (fileStats.size > MAX_SIZE_BYTES) {
      oversized.push({ file, size: fileStats.size })
    }
  }

  if (oversized.length === 0) {
    console.log(`Bundle size check passed: all client JS assets are <= ${formatKb(MAX_SIZE_BYTES)}`)
    return
  }

  console.error(`Bundle size check failed: found client JS assets > ${formatKb(MAX_SIZE_BYTES)}`)
  for (const item of oversized) {
    const relativePath = path.relative(process.cwd(), item.file)
    console.error(`- ${relativePath} (${formatKb(item.size)})`)
  }

  process.exit(1)
}

main().catch((error) => {
  console.error("Bundle size check failed with an unexpected error")
  console.error(error)
  process.exit(1)
})
