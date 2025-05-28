#!/usr/bin/env node

const http = require('http')

const BASE_URL = 'http://localhost:8787'
const PROJECT_ID = '9'
const VERSION_UUID = 'live'
const DOCUMENT_PATH = 'copilot-prompt'
const AUTH_TOKEN = '626ec0c7-9473-4897-b405-f9a07b737e1e'

const ENDPOINT = `${BASE_URL}/api/v3/projects/${PROJECT_ID}/versions/${VERSION_UUID}/documents/${DOCUMENT_PATH}`

// Parse command line arguments
const args = process.argv.slice(2)
const getArg = (name, defaultValue) => {
  const index = args.findIndex((arg) => arg.startsWith(`--${name}=`))
  if (index !== -1) {
    return args[index].split('=')[1]
  }
  const flagIndex = args.indexOf(`--${name}`)
  if (flagIndex !== -1 && args[flagIndex + 1]) {
    return args[flagIndex + 1]
  }
  return defaultValue
}

const BURST_SIZE = parseInt(getArg('burst', '10'))

// Show help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🔬 Rate Limit Testing Script
============================

Usage: node test-rate-limit.js [options]

Options:
  --burst=N         Number of simultaneous requests (default: 10)
  --help, -h        Show this help

Examples:
  node test-rate-limit.js --burst=20
  node test-rate-limit.js --burst=5
`)
  process.exit(0)
}

async function makeRequest(requestNumber) {
  return new Promise((resolve) => {
    const startTime = Date.now()

    const options = {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }

    const req = http.request(ENDPOINT, options, (res) => {
      const duration = Date.now() - startTime

      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        const headers = {
          'x-ratelimit-limit': res.headers['x-ratelimit-limit'],
          'x-ratelimit-remaining': res.headers['x-ratelimit-remaining'],
          'x-ratelimit-reset': res.headers['x-ratelimit-reset'],
          'retry-after': res.headers['retry-after'],
        }

        resolve({
          requestNumber,
          statusCode: res.statusCode,
          duration,
          headers,
          success: res.statusCode < 400,
        })
      })
    })

    req.on('error', (error) => {
      resolve({
        requestNumber,
        statusCode: 'ERROR',
        duration: Date.now() - startTime,
        error: error.message,
        success: false,
      })
    })

    req.end()
  })
}

async function main() {
  console.log('🔬 Rate Limit Testing Script')
  console.log('============================')
  console.log(`📍 Endpoint: ${ENDPOINT}`)
  console.log(`🔑 Token: ${AUTH_TOKEN.substring(0, 8)}...`)
  console.log(`🚀 Testing burst (${BURST_SIZE} simultaneous requests)...`)
  console.log('─'.repeat(50))

  try {
    const promises = Array.from({ length: BURST_SIZE }, (_, i) =>
      makeRequest(i + 1),
    )
    const startTime = Date.now()
    const results = await Promise.all(promises)
    const duration = Date.now() - startTime

    results.forEach((result) => {
      const status = result.success ? '✅' : '❌'
      const rateLimitInfo = result.headers
        ? `[Remaining: ${result.headers['x-ratelimit-remaining']}]`
        : ''
      console.log(
        `  ${status} Request ${result.requestNumber}: ${result.statusCode} (${result.duration}ms) ${rateLimitInfo}`,
      )
    })

    const successful = results.filter((r) => r.success)
    const rateLimited = results.filter((r) => r.statusCode === 429)
    const errors = results.filter((r) => !r.success && r.statusCode !== 429)
    const burstRPS = ((BURST_SIZE / duration) * 1000).toFixed(1)

    console.log(`\n${'='.repeat(50)}`)
    console.log('📊 SUMMARY')
    console.log('='.repeat(50))
    console.log(`✅ Successful: ${successful.length}/${BURST_SIZE}`)
    console.log(`🚫 Rate limited: ${rateLimited.length}/${BURST_SIZE}`)
    console.log(`❌ Errors: ${errors.length}/${BURST_SIZE}`)
    console.log(`📈 Burst RPS: ${burstRPS}`)

    if (successful.length > 0) {
      const avgDuration =
        successful.reduce((sum, r) => sum + r.duration, 0) / successful.length
      console.log(`⏱️  Avg response time: ${avgDuration.toFixed(0)}ms`)

      const firstSuccess = successful[0]
      if (firstSuccess?.headers['x-ratelimit-limit']) {
        console.log(
          `📊 Rate limit: ${firstSuccess.headers['x-ratelimit-limit']} req/sec`,
        )
      }
    }

    if (rateLimited.length > 0) {
      const firstRateLimit = rateLimited[0]
      console.log(
        `🔴 First rate limit at request #${firstRateLimit.requestNumber}`,
      )
    }
  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  }

  console.log('\n✨ Test completed!')
}

if (require.main === module) {
  main()
}
