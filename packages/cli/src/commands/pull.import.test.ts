import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PullCommand } from './pull'
import * as fsSync from 'fs'
import * as path from 'path'
import * as os from 'os'

// These tests create real temp files to verify dynamic import behavior

describe('PullCommand.importPromptFromFile (default exports)', () => {
  const pull = new PullCommand() as any
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'latitude-cli-test-'))
  })

  afterEach(() => {
    // Cleanup tmp dir
    try {
      fsSync.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  it('reads default export from .mjs (ESM)', async () => {
    const file = path.join(tmpDir, 'default-esm.mjs')
    fsSync.writeFileSync(file, "export default 'esm hello'\n")

    const content = await pull.importPromptFromFile(file)
    expect(content).toBe('esm hello')
  })

  it('reads default export from .cjs (CJS)', async () => {
    const file = path.join(tmpDir, 'default-cjs.cjs')
    fsSync.writeFileSync(file, "module.exports = 'cjs hello'\n")

    const content = await pull.importPromptFromFile(file)
    expect(content).toBe('cjs hello')
  })
})
