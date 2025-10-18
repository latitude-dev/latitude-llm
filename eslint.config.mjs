import { defineConfig } from 'eslint/config'
import baseConfig from '@latitude-data/eslint-config'
import nextPlugin from '@next/eslint-plugin-next'

/**
 * Common rules shared across all packages and apps
 */
const COMMON_RULES = {
  'no-constant-condition': 'off',
}

/**
 * Root ESLint configuration for Latitude LLM monorepo
 * Uses ESLint 9 flat config format
 */
export default defineConfig(
  ...baseConfig,
  {
    // Global ignores for the entire monorepo
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/out/**',
      '**/build/**',
      '**/.turbo/**',
      '**/docker/pgdata/**',
      '**/storage/**',
      '**/tmp/**',
      '**/.*.js',
      '**/drizzle/**',
      '**/coverage/**',
      // Next.js specific ignores
      'apps/web/.next/**',
      'apps/web/out/**',
      'apps/web/public/**',
      // Build artifacts
      '**/*.config.js',
      '**/*.config.mjs',
      '**/rollup.config.*',
      '**/vitest.config.*',
    ],
  },
  // Apps/Web - Next.js specific configuration
  {
    files: ['apps/web/**/*.{js,jsx,ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...COMMON_RULES,
    },
  },
  // Packages/Core - Stricter TypeScript rules
  {
    files: ['packages/core/**/*.{ts,tsx}'],
    rules: {
      ...COMMON_RULES,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
    },
  },
  // Apps/Gateway - Basic Node.js rules
  {
    files: ['apps/gateway/**/*.ts'],
    rules: COMMON_RULES,
  },
  // Apps/Workers - Basic Node.js rules
  {
    files: ['apps/workers/**/*.ts'],
    rules: COMMON_RULES,
  },
  // Apps/WebSockets - Basic Node.js rules
  {
    files: ['apps/websockets/**/*.ts'],
    rules: COMMON_RULES,
  },
  // Apps/Console - Basic Node.js rules
  {
    files: ['apps/console/**/*.ts'],
    rules: COMMON_RULES,
  },
  // Packages/Web-UI - React component library
  {
    files: ['packages/web-ui/**/*.{ts,tsx}'],
    rules: COMMON_RULES,
  },
  // Packages/Constants - Basic rules
  {
    files: ['packages/constants/**/*.ts'],
    rules: COMMON_RULES,
  },
  // Packages/Env - Basic rules
  {
    files: ['packages/env/**/*.ts'],
    rules: COMMON_RULES,
  },
  // Packages/CLI - Basic Node.js rules
  {
    files: ['packages/cli/**/*.ts'],
    rules: COMMON_RULES,
  },
  // SDKs - TypeScript SDK
  {
    files: ['packages/sdks/typescript/**/*.ts'],
    rules: COMMON_RULES,
  },
  // Telemetry - TypeScript telemetry
  {
    files: ['packages/telemetry/typescript/**/*.ts'],
    rules: COMMON_RULES,
  },
)

