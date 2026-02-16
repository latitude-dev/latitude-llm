import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: ['bin/*.ts', 'eslint.config.mjs'],
      ignoreDependencies: ['@next/eslint-plugin-next', 'glob'],
    },
    'apps/web': {
      entry: [
        'src/app/**/page.tsx',
        'src/app/**/layout.tsx',
        'src/app/**/route.ts',
        'src/app/**/error.tsx',
        'src/app/**/not-found.tsx',
        'src/app/global-error.tsx',
        'src/app/**/@modal/**/default.tsx',
        'src/instrumentation.ts',
        'src/instrumentation-client.ts',
        'next.config.mjs',
        'rollup.config.workers.mjs',
        'src/workers/*.ts',
      ],
      project: ['src/**/*.{ts,tsx}'],
      ignore: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/tests/**'],
      ignoreDependencies: [
        '@datadog/datadog-ci',
        'sharp',
        '@latitude-data/web-ui',
        '@babel/preset-typescript',
        '@rollup/plugin-typescript',
        'autoprefixer',
        'postcss',
        'tailwindcss',
        'import-in-the-middle',
        'require-in-the-middle',
      ],
    },
    'apps/gateway': {
      project: ['src/**/*.ts'],
      ignore: ['src/**/*.test.ts'],
    },
    'apps/workers': {
      project: ['src/**/*.ts'],
      ignore: ['src/**/*.test.ts'],
    },
    'apps/websockets': {
      project: ['src/**/*.ts'],
      ignore: ['src/**/*.test.ts'],
    },
    'apps/console': {
      project: ['src/**/*.ts'],
    },
    'packages/core': {
      entry: ['src/**/*.ts', 'drizzle.config.ts'],
      project: ['src/**/*.ts'],
      ignore: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/tests/**'],
      ignoreDependencies: ['dd-trace', '@clickhouse/client'],
    },
    'packages/web-ui': {
      entry: ['src/**/index.ts', 'src/**/index.tsx'],
      project: ['src/**/*.{ts,tsx}'],
      ignore: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
    'packages/constants': {
      entry: ['src/**/*.ts'],
      project: ['src/**/*.ts'],
    },
    'packages/env': {
      project: ['src/**/*.ts'],
    },
    'packages/emails': {
      entry: ['src/**/index.tsx', 'src/**/*.ts'],
      project: ['src/**/*.{ts,tsx}'],
    },
    'packages/cli': {
      project: ['src/**/*.ts'],
      ignore: ['src/**/*.test.ts'],
    },
    'packages/sdks/typescript': {
      entry: ['src/index.ts'],
      project: ['src/**/*.ts'],
      ignore: ['src/**/*.test.ts', 'src/test/**', 'src/tests/**'],
    },
    'packages/telemetry/typescript': {
      entry: ['src/index.ts'],
      project: ['src/**/*.ts'],
      ignore: ['src/**/*.test.ts', 'src/tests/**'],
    },
  },
  exclude: ['optionalPeerDependencies', 'unlisted', 'binaries', 'unresolved'],
  ignoreExportsUsedInFile: true,
  eslint: false,
  tsup: false,
  rollup: false,
  postcss: false,
  tailwind: false,
  vitest: false,
  next: false,
  drizzle: false,
}

export default config
