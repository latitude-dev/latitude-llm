#!/usr/bin/env node
/**
 * Setup script for test database
 *
 * 1. Loads .env.test from repo root
 * 2. Creates the test database if it doesn't exist
 * 3. Runs drizzle-kit migrations
 */

import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { config as loadDotenv } from "dotenv"
import pg from "pg"

const { Client } = pg

// Find and load .env.test from repo root
const findEnvFile = () => {
  let currentDir = process.cwd()

  // Search up to 5 parent directories
  for (let i = 0; i < 5; i++) {
    const envPath = resolve(currentDir, ".env.test")
    if (existsSync(envPath)) {
      return envPath
    }
    const parentDir = resolve(currentDir, "..")
    if (parentDir === currentDir) break
    currentDir = parentDir
  }

  // Fallback to common locations
  const fallbacks = [
    resolve(process.cwd(), "../../.env.test"),
    resolve(process.cwd(), "../../../.env.test"),
    "/home/geclos/code/work/latitude-llm/.env.test",
  ]

  for (const path of fallbacks) {
    if (existsSync(path)) {
      return path
    }
  }

  return null
}

const envPath = findEnvFile()
if (!envPath) {
  console.error("❌ Could not find .env.test file")
  process.exit(1)
}

console.log(`📝 Loading environment from: ${envPath}`)
loadDotenv({ path: envPath })

const databaseUrl = process.env.LAT_DATABASE_URL
if (!databaseUrl) {
  console.error("❌ LAT_DATABASE_URL not set in .env.test")
  process.exit(1)
}

// Parse database URL
const url = new URL(databaseUrl)
const dbName = url.pathname.slice(1) // Remove leading /
const host = url.hostname
const port = url.port || "5432"
const user = url.username
const password = url.password

console.log(`🎯 Test database: ${dbName} on ${host}:${port}`)

// Create database connection string for postgres (default) database
const adminUrl = `postgres://${user}:${password}@${host}:${port}/postgres`

async function setupTestDatabase() {
  const client = new Client({ connectionString: adminUrl })

  try {
    await client.connect()
    console.log("🔌 Connected to PostgreSQL")

    // Check if database exists
    const checkResult = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName])

    if (checkResult.rows.length === 0) {
      console.log(`🆕 Creating database: ${dbName}`)
      // Create database (use double quotes for special characters)
      await client.query(`CREATE DATABASE "${dbName}"`)
      console.log(`✅ Database created: ${dbName}`)
    } else {
      console.log(`ℹ️  Database already exists: ${dbName}`)
    }

    await client.end()

    // Run migrations
    console.log("🚀 Running drizzle-kit migrations...")
    execSync("npx drizzle-kit migrate --config=drizzle.config.ts", {
      stdio: "inherit",
      cwd: process.cwd(),
      env: {
        ...process.env,
        LAT_DATABASE_URL: databaseUrl,
      },
    })

    console.log("✅ Test database setup complete!")
  } catch (error) {
    console.error("❌ Error setting up test database:", error.message)
    await client.end()
    process.exit(1)
  }
}

setupTestDatabase()
