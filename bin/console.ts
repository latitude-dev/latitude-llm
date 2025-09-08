#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const rootDir = resolve(__dirname, '..')
const consoleDir = resolve(__dirname, '../apps/console')
const envFile = resolve(rootDir, '.env.development')

// Run tsx with the correct working directory and environment
const child = spawn(
  'pnpm',
  ['exec', 'dotenv', '-e', envFile, '--', 'tsx', 'src/index.ts'],
  {
    cwd: consoleDir,
    stdio: 'inherit',
    env: { ...process.env, NODE_DEBUG: 'latitude:debug' },
  },
)

child.on('exit', (code) => {
  process.exit(code || 0)
})
