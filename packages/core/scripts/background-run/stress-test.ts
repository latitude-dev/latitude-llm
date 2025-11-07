#!/usr/bin/env tsx
/**
 * Stress test script to reproduce race condition in background runs
 *
 * Usage:
 *   pnpm background
 *
 * Examples:
 *   tsx stress-test-runs.ts 2
 *   tsx stress-test-runs.ts 10
 *   tsx stress-test-runs.ts 40
 *   tsx stress-test-runs.ts 100
 */

// Local testing credentials. Use your own.

import '@latitude-data/env'

const CONFIG = {
  API_URL:
    'http://localhost:8787/api/v3/projects/74/versions/live/documents/run',
  API_KEY:
    process.env.LATITUDE_API_KEY ||
    (() => {
      console.error('❌ LATITUDE_API_KEY is not set!')
      process.exit(1)
    })(),
  DOCUMENT_PATH: 'stress-test',
  PARAMETERS: {
    phrase: 'They had a wonderful experience!',
  },
}

interface RunResult {
  requestId: number
  success: boolean
  uuid?: string
  duration: number
  error?: string
  statusCode?: number
}

async function makeRequest(requestId: number): Promise<RunResult> {
  const startTime = Date.now()

  try {
    const response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CONFIG.API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: CONFIG.DOCUMENT_PATH,
        stream: false,
        parameters: CONFIG.PARAMETERS,
        background: true,
      }),
    })

    const duration = Date.now() - startTime
    const data = await response.json()

    if (!response.ok) {
      return {
        requestId,
        success: false,
        duration,
        error: JSON.stringify(data),
        statusCode: response.status,
      }
    }

    return {
      requestId,
      success: true,
      uuid: data.uuid,
      duration,
      statusCode: response.status,
    }
  } catch (error) {
    return {
      requestId,
      success: false,
      duration: Date.now() - startTime,
      error: (error as Error).message,
    }
  }
}

async function runStressTest(numRequests: number) {
  console.log(
    `\n🚀 Starting stress test with ${numRequests} parallel requests...\n`,
  )
  console.log(`API: ${CONFIG.API_URL}`)
  console.log(`Document: ${CONFIG.DOCUMENT_PATH}`)
  console.log(`Parameters:`, JSON.stringify(CONFIG.PARAMETERS))
  console.log(`\n${'='.repeat(80)}\n`)

  const startTime = Date.now()

  // Fire all requests in parallel
  console.log(`⏳ Sending ${numRequests} requests...`)
  const promises = Array.from({ length: numRequests }, (_, i) =>
    makeRequest(i + 1),
  )
  const results = await Promise.all(promises)

  const totalDuration = Date.now() - startTime

  // Analyze results
  const successful = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)

  console.log(`\n✅ Completed all requests in ${totalDuration}ms\n`)
  console.log(`${'='.repeat(80)}\n`)
  console.log(`📊 RESULTS SUMMARY:\n`)
  console.log(`  Total requests:    ${numRequests}`)
  console.log(
    `  Successful:        ${successful.length} (${((successful.length / numRequests) * 100).toFixed(1)}%)`,
  )
  console.log(
    `  Failed:            ${failed.length} (${((failed.length / numRequests) * 100).toFixed(1)}%)`,
  )
  console.log(
    `  Avg response time: ${(results.reduce((sum, r) => sum + r.duration, 0) / results.length).toFixed(0)}ms`,
  )
  console.log(
    `  Min response time: ${Math.min(...results.map((r) => r.duration))}ms`,
  )
  console.log(
    `  Max response time: ${Math.max(...results.map((r) => r.duration))}ms`,
  )

  if (failed.length > 0) {
    console.log(`\n❌ FAILED REQUESTS:\n`)
    failed.forEach((r) => {
      console.log(
        `  Request #${r.requestId}: [${r.statusCode || 'N/A'}] ${r.error}`,
      )
    })
  }

  // Wait a bit for jobs to complete
  console.log(`\n⏳ Waiting 5 seconds for jobs to complete...\n`)
  await new Promise((resolve) => setTimeout(resolve, 5000))

  // Check for stuck runs
  console.log(`🔍 Checking for stuck runs...\n`)

  const uuids = successful
    .filter((r) => r.uuid)
    .map((r) => ({ uuid: r.uuid!, requestId: r.requestId }))

  if (uuids.length === 0) {
    console.log(`⚠️  No UUIDs to check (all requests may have failed)\n`)
    return
  }

  console.log(`Checking ${uuids.length} runs...`)

  // Note: This check requires authentication - may not work without session
  // You'll need to manually check the UI or use the BullMQ admin to verify

  console.log(`\n${'='.repeat(80)}\n`)
  console.log(`🎯 RACE CONDITION CHECK:\n`)
  console.log(`To verify if the race condition occurred:`)
  console.log(
    `  1. Check BullMQ admin: http://localhost:3000/admin/queues/runsQueue`,
  )
  console.log(`  2. Check Redis cache for stuck entries:`)
  console.log(`     redis-cli KEYS "*runs:active*"`)
  console.log(`  3. Check the UI at http://localhost:3000/projects/50`)
  console.log(`     Look for runs stuck "in progress"`)
  console.log(`\n`)
  console.log(`Run UUIDs to check:`)
  uuids.slice(0, 10).forEach(({ uuid, requestId }) => {
    console.log(`  Request #${requestId}: ${uuid}`)
  })
  if (uuids.length > 10) {
    console.log(`  ... and ${uuids.length - 10} more`)
  }
  console.log(`\n${'='.repeat(80)}\n`)
}

// Main
const numRequests = parseInt(process.argv[2]) || 2

if (isNaN(numRequests) || numRequests < 1) {
  console.error(
    '❌ Invalid number of requests. Usage: tsx stress-test-runs.ts <number>',
  )
  process.exit(1)
}

runStressTest(numRequests).catch((error) => {
  console.error('❌ Stress test failed:', error)
  process.exit(1)
})
