#!/usr/bin/env npx tsx
/**
 * Run all or specific provider tests.
 *
 * Usage:
 *    npx tsx examples/run_all.ts                    # Run all available tests
 *    npx tsx examples/run_all.ts openai anthropic   # Run specific tests
 *    npx tsx examples/run_all.ts --list             # List all tests
 */

import { spawn } from 'child_process'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

type TestConfig = {
  file: string
  requiredEnvVars: string[]
}

const TESTS: Record<string, TestConfig> = {
  openai: {
    file: 'test_openai.ts',
    requiredEnvVars: ['OPENAI_API_KEY'],
  },
  anthropic: {
    file: 'test_anthropic.ts',
    requiredEnvVars: ['ANTHROPIC_API_KEY'],
  },
  cohere: {
    file: 'test_cohere.ts',
    requiredEnvVars: ['COHERE_API_KEY'],
  },
  together: {
    file: 'test_together.ts',
    requiredEnvVars: ['TOGETHER_API_KEY'],
  },
  azure: {
    file: 'test_azure.ts',
    requiredEnvVars: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT'],
  },
  bedrock: {
    file: 'test_bedrock.ts',
    requiredEnvVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
  },
  vertex: {
    file: 'test_vertex.ts',
    requiredEnvVars: ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT'],
  },
  langchain: {
    file: 'test_langchain.ts',
    requiredEnvVars: ['OPENAI_API_KEY'],
  },
  llamaindex: {
    file: 'test_llamaindex.ts',
    requiredEnvVars: ['OPENAI_API_KEY'],
  },
}

function checkCommonEnv(): string[] {
  const missing: string[] = []
  if (!process.env.LATITUDE_API_KEY) missing.push('LATITUDE_API_KEY')
  if (!process.env.LATITUDE_PROJECT_ID) missing.push('LATITUDE_PROJECT_ID')
  return missing
}

function checkTestEnv(testName: string): string[] {
  const config = TESTS[testName]
  if (!config) return []
  return config.requiredEnvVars.filter((v) => !process.env[v])
}

function canRunTest(testName: string): { canRun: boolean; missing: string[] } {
  const missing = checkTestEnv(testName)
  return { canRun: missing.length === 0, missing }
}

async function runTest(testName: string): Promise<boolean> {
  const config = TESTS[testName]
  if (!config) {
    console.log(`  [SKIP] Unknown test: ${testName}`)
    return false
  }

  const { canRun, missing } = canRunTest(testName)
  if (!canRun) {
    console.log(`  [SKIP] Missing env vars: ${missing.join(', ')}`)
    return false
  }

  const testFile = path.join(__dirname, config.file)

  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', testFile], {
      stdio: 'pipe',
      env: process.env,
    })

    let output = ''
    let errorOutput = ''

    child.stdout?.on('data', (data) => {
      output += data.toString()
    })

    child.stderr?.on('data', (data) => {
      errorOutput += data.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        const lines = output.trim().split('\n')
        const responseLine = lines.find((l) => l.includes('Response:'))
        if (responseLine) {
          const response = responseLine.replace('Response:', '').trim()
          const truncated =
            response.length > 100 ? `${response.slice(0, 100)}...` : response
          console.log(`  [OK] Response: ${truncated}`)
        } else {
          console.log(`  [OK]`)
        }
        resolve(true)
      } else {
        const errorMsg = errorOutput.split('\n')[0] || 'Unknown error'
        console.log(`  [FAIL] ${errorMsg}`)
        resolve(false)
      }
    })

    child.on('error', (err) => {
      console.log(`  [FAIL] ${err.message}`)
      resolve(false)
    })
  })
}

function listTests(): void {
  console.log('\nAvailable tests:\n')
  console.log(`${'Test'.padEnd(15)} ${'Required Env Vars'.padEnd(50)} Status`)
  console.log('-'.repeat(80))

  for (const [testName, config] of Object.entries(TESTS)) {
    const { canRun, missing } = canRunTest(testName)
    const status = canRun ? '[READY]' : `[MISSING: ${missing.join(', ')}]`
    const varsStr =
      config.requiredEnvVars.length > 0
        ? config.requiredEnvVars.join(', ')
        : '(none)'
    console.log(`${testName.padEnd(15)} ${varsStr.padEnd(50)} ${status}`)
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--list')) {
    listTests()
    return
  }

  const missingCommon = checkCommonEnv()
  if (missingCommon.length > 0) {
    console.log(`Error: Missing required env vars: ${missingCommon.join(', ')}`)
    console.log('\nSet these first:')
    console.log("  export LATITUDE_API_KEY='your-key'")
    console.log("  export LATITUDE_PROJECT_ID='your-project-id'")
    process.exit(1)
  }

  const testsToRun =
    args.length > 0
      ? args.filter((a) => !a.startsWith('-'))
      : Object.keys(TESTS)

  console.log(`\nRunning ${testsToRun.length} test(s) against localhost:8787\n`)

  let passed = 0
  let failed = 0
  let skipped = 0

  for (const testName of testsToRun) {
    if (!TESTS[testName]) {
      console.log(`[${testName}] Unknown test`)
      continue
    }

    console.log(`[${testName}]`)
    const { canRun } = canRunTest(testName)

    if (canRun) {
      const success = await runTest(testName)
      if (success) {
        passed++
      } else {
        failed++
      }
    } else {
      await runTest(testName)
      skipped++
    }
  }

  console.log(`\n${'='.repeat(40)}`)
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`)
}

main().catch(console.error)
