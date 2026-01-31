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
export default defineConfig([
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
      'apps/web/.next/**',
      'apps/web/out/**',
      'apps/web/public/**',
      '**/*.config.js',
      '**/vitest.config.*',
      '**/rollup.config.*',
      '**/tsup.config.*',
      '**/postcss.config.*',
      '**/tailwind.config.*',
      '**/next.config.*',
    ],
  },
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
  {
    files: ['packages/core/**/*.{ts,tsx}'],
    rules: {
      ...COMMON_RULES,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
    },
  },
  {
    files: ['apps/gateway/**/*.ts'],
    rules: COMMON_RULES,
  },
  {
    files: ['apps/workers/**/*.ts'],
    rules: COMMON_RULES,
  },
  {
    files: ['apps/websockets/**/*.ts'],
    rules: COMMON_RULES,
  },
  {
    files: ['apps/console/**/*.ts'],
    rules: COMMON_RULES,
  },
  {
    files: ['packages/web-ui/**/*.{ts,tsx}'],
    rules: COMMON_RULES,
  },
  {
    files: ['packages/constants/**/*.ts'],
    rules: COMMON_RULES,
  },
  {
    files: ['packages/env/**/*.ts'],
    rules: COMMON_RULES,
  },
  {
    files: ['packages/emails/**/*.{ts,tsx}'],
    rules: COMMON_RULES,
  },
  {
    files: ['packages/cli/**/*.ts'],
    rules: COMMON_RULES,
  },
  {
    files: ['packages/sdks/typescript/**/*.ts'],
    rules: COMMON_RULES,
  },
  {
    files: ['packages/telemetry/typescript/**/*.ts'],
    rules: COMMON_RULES,
  },
])

