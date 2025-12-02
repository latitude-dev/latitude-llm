#!/usr/bin/env tsx

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MODELS_DEV_API_URL = 'https://models.dev/api.json'
const OUTPUT_PATH = path.join(__dirname, '../src/assets/models.dev.json')
const TIMEOUT_MS = 30 * 1000 // 30 seconds

/**
 * Downloads the latest models.dev data and updates the bundled JSON file
 */
async function updateModelsDevData(): Promise<void> {
  console.log('📥 Downloading latest models.dev data...')
  console.log(`   URL: ${MODELS_DEV_API_URL}`)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const response = await fetch(MODELS_DEV_API_URL, {
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache',
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(
        `API returned status ${response.status}: ${response.statusText}`,
      )
    }

    const data = await response.json()

    // Validate the data structure
    if (!data || typeof data !== 'object') {
      throw new Error('API returned invalid data structure')
    }

    // Write to file
    const jsonString = JSON.stringify(data, null, 2)
    fs.writeFileSync(OUTPUT_PATH, jsonString)

    const stats = fs.statSync(OUTPUT_PATH)
    const fileSizeKb = (stats.size / 1024).toFixed(2)

    console.log('✅ Successfully updated models.dev data')
    console.log(`   Output: ${OUTPUT_PATH}`)
    console.log(`   Size: ${fileSizeKb} KB`)
    console.log(`   Updated: ${new Date().toISOString()}`)

    process.exit(0)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('❌ Failed to update models.dev data')
    console.error(`   Error: ${message}`)
    process.exit(1)
  }
}

// Run the update
updateModelsDevData()
