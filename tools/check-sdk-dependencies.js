#!/usr/bin/env node

/**
 * Checks that a package.json file does not contain any @latitude-data/*
 * packages in regular dependencies. Dev dependencies and peer dependencies
 * are allowed.
 *
 * Usage: node check-sdk-dependencies.js <path-to-package.json>
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

const packageJsonPath = process.argv[2]

if (!packageJsonPath) {
  console.error('Usage: node check-sdk-dependencies.js <path-to-package.json>')
  process.exit(1)
}

const absolutePath = resolve(packageJsonPath)
let packageJson

try {
  const content = readFileSync(absolutePath, 'utf-8')
  packageJson = JSON.parse(content)
} catch (error) {
  console.error(`Failed to read package.json at ${absolutePath}:`, error.message)
  process.exit(1)
}

const dependencies = packageJson.dependencies || {}
const latitudePackages = Object.keys(dependencies).filter((dep) =>
  dep.startsWith('@latitude-data/')
)

if (latitudePackages.length > 0) {
  console.error(
    '\nError: Found @latitude-data/* packages in regular dependencies:'
  )
  latitudePackages.forEach((pkg) => {
    console.error(`  - ${pkg}: ${dependencies[pkg]}`)
  })
  console.error(
    '\nThese internal packages should not be published as dependencies.'
  )
  console.error(
    'Move them to devDependencies or peerDependencies if needed.\n'
  )
  process.exit(1)
}

console.log(
  `✓ No @latitude-data/* packages found in dependencies of ${packageJson.name}`
)
process.exit(0)
