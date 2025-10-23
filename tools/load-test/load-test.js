#!/usr/bin/env node
/**
 * Latitude Load Testing Script
 *
 * Targets 60 prompt runs per second for 2 minutes
 *
 * Usage:
 *   LATITUDE_API_KEY=your-key PROJECT_ID=123 node load-test.js
 */

import { Latitude, LatitudeApiError } from '@latitude-data/sdk'

// Configuration
const CONFIG = {
  apiKey: process.env.LATITUDE_API_KEY,
  projectId: process.env.PROJECT_ID,
  versionUuid: process.env.VERSION_UUID,
  promptPath: process.env.PROMPT_PATH,
  targetRPS: 60, // Requests per second
  durationSeconds: 180, // 3 minutes
  parameters: {
    company_name: '',
  },
}

// Stats tracking
const stats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalLatency: 0,
  minLatency: Infinity,
  maxLatency: 0,
  errors: [],
  rateLimitRetries: 0,
  startTime: 0,
  endTime: 0,
}

// Initialize SDK
const sdk = new Latitude(CONFIG.apiKey, {
  projectId: CONFIG.projectId,
  versionUuid: CONFIG.versionUuid,
})

// Sample company names for randomization
const COMPANY_NAMES = [
  'Acme Corporation',
  'TechVision Inc',
  'Global Solutions Ltd',
  'Innovative Systems',
  'Digital Dynamics',
  'FutureTech Industries',
  'Apex Enterprises',
  'Nexus Technologies',
  'Quantum Solutions',
  'Velocity Corp',
  'Horizon Innovations',
  'Pinnacle Systems',
  'Summit Technologies',
  'Vertex Group',
  'Catalyst Solutions',
  'Momentum Inc',
  'Synergy Corporation',
  'Axiom Technologies',
  'Stellar Enterprises',
  'Zenith Solutions',
  'Eclipse Systems',
  'Vanguard Corp',
  'Meridian Tech',
  'Cornerstone Industries',
  'Titan Technologies',
  'Olympus Solutions',
  'Phoenix Enterprises',
  'Atlas Corporation',
  'Nova Systems',
  'Genesis Tech',
]

/**
 * Get a random company name
 */
function getRandomCompanyName() {
  return COMPANY_NAMES[Math.floor(Math.random() * COMPANY_NAMES.length)]
}

/**
 * Execute a single prompt run and track metrics
 */
async function runPrompt() {
  const startTime = Date.now()
  stats.totalRequests++

  const maxRetries = 5
  const retryDelay = 30_000

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await sdk.prompts.run(CONFIG.promptPath, {
        parameters: {
          company_name: getRandomCompanyName(),
        },
        stream: false,
      })

      const latency = Date.now() - startTime
      stats.successfulRequests++
      stats.totalLatency += latency
      stats.minLatency = Math.min(stats.minLatency, latency)
      stats.maxLatency = Math.max(stats.maxLatency, latency)
      return
    } catch (error) {
      if (error instanceof LatitudeApiError) {
        const is429 = error?.status === 429

        if (is429 && attempt < maxRetries) {
          stats.rateLimitRetries++
          await new Promise((resolve) => setTimeout(resolve, retryDelay))
          continue
        }
      }

      stats.failedRequests++
      const errorMsg = error instanceof Error ? error.message : String(error)
      stats.errors.push(errorMsg)
      return
    }
  }
}

/**
 * Print current statistics
 */
function printStats() {
  const elapsed = (Date.now() - stats.startTime) / 1000
  const avgLatency =
    stats.successfulRequests > 0
      ? (stats.totalLatency / stats.successfulRequests).toFixed(2)
      : 0
  const actualRPS = (stats.totalRequests / elapsed).toFixed(2)
  const successRate =
    stats.totalRequests > 0
      ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2)
      : 0

  console.clear()
  console.log('='.repeat(60))
  console.log('LATITUDE LOAD TEST - LIVE STATS')
  console.log('='.repeat(60))
  console.log(
    `Elapsed Time:        ${elapsed.toFixed(1)}s / ${CONFIG.durationSeconds}s`,
  )
  console.log(`Target RPS:          ${CONFIG.targetRPS}`)
  console.log(`Actual RPS:          ${actualRPS}`)
  console.log(`Total Requests:      ${stats.totalRequests}`)
  console.log(`Successful:          ${stats.successfulRequests}`)
  console.log(`Failed:              ${stats.failedRequests}`)
  console.log(`Success Rate:        ${successRate}%`)
  console.log(`Rate Limit Retries:  ${stats.rateLimitRetries}`)
  console.log('-'.repeat(60))
  console.log(`Avg Latency:         ${avgLatency}ms`)
  console.log(
    `Min Latency:         ${stats.minLatency === Infinity ? 'N/A' : stats.minLatency + 'ms'}`,
  )
  console.log(`Max Latency:         ${stats.maxLatency}ms`)
  console.log('='.repeat(60))

  if (stats.errors.length > 0) {
    console.log('\nRecent Errors (last 5):')
    stats.errors.slice(-5).forEach((err, idx) => {
      console.log(`  ${idx + 1}. ${err}`)
    })
  }
}

/**
 * Generate final report
 */
function printFinalReport() {
  const totalDuration = (stats.endTime - stats.startTime) / 1000
  const avgLatency =
    stats.successfulRequests > 0
      ? (stats.totalLatency / stats.successfulRequests).toFixed(2)
      : 0
  const actualRPS = (stats.totalRequests / totalDuration).toFixed(2)
  const successRate =
    stats.totalRequests > 0
      ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2)
      : 0

  console.log('\n')
  console.log('='.repeat(60))
  console.log('FINAL REPORT')
  console.log('='.repeat(60))
  console.log(`Duration:            ${totalDuration.toFixed(2)}s`)
  console.log(`Target RPS:          ${CONFIG.targetRPS}`)
  console.log(`Actual RPS:          ${actualRPS}`)
  console.log(`Total Requests:      ${stats.totalRequests}`)
  console.log(`Successful:          ${stats.successfulRequests}`)
  console.log(`Failed:              ${stats.failedRequests}`)
  console.log(`Success Rate:        ${successRate}%`)
  console.log(`Rate Limit Retries:  ${stats.rateLimitRetries}`)
  console.log('-'.repeat(60))
  console.log(`Average Latency:     ${avgLatency}ms`)
  console.log(
    `Min Latency:         ${stats.minLatency === Infinity ? 'N/A' : stats.minLatency + 'ms'}`,
  )
  console.log(`Max Latency:         ${stats.maxLatency}ms`)
  console.log('='.repeat(60))

  if (stats.errors.length > 0) {
    console.log(`\nTotal Unique Errors: ${new Set(stats.errors).size}`)
    console.log('Error samples:')
    Array.from(new Set(stats.errors))
      .slice(0, 10)
      .forEach((err, idx) => {
        const count = stats.errors.filter((e) => e === err).length
        console.log(`  ${idx + 1}. [${count}x] ${err}`)
      })
  }
}

/**
 * Main load test execution
 */
async function runLoadTest() {
  console.log('Starting Latitude Load Test...')
  console.log(`Target: ${CONFIG.targetRPS} RPS for ${CONFIG.durationSeconds}s`)
  console.log(`Prompt: ${CONFIG.promptPath}`)
  console.log(`Project ID: ${CONFIG.projectId}`)
  console.log(`Version: ${CONFIG.versionUuid}`)
  console.log('\n')

  stats.startTime = Date.now()
  const intervalMs = 1000 / CONFIG.targetRPS // Time between requests
  const endTime = stats.startTime + CONFIG.durationSeconds * 1000

  // Update stats display every second
  const statsInterval = setInterval(printStats, 1000)

  // Main execution loop
  const activeRequests = new Set()

  while (Date.now() < endTime) {
    const requestPromise = runPrompt()
    activeRequests.add(requestPromise)

    // Clean up completed requests
    requestPromise.finally(() => activeRequests.delete(requestPromise))

    // Wait for the interval before next request
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  // Wait for all active requests to complete
  console.log('\nWaiting for active requests to complete...')
  await Promise.all(Array.from(activeRequests))

  stats.endTime = Date.now()
  clearInterval(statsInterval)

  // Print final report
  printFinalReport()
}

// Run the load test
runLoadTest().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
