import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: ['bin/*.ts', 'eslint.config.mjs'],
      ignore: [
        'docs/script.js',
        'tools/generate-server-action-key.js',
        'tools/typescript/types/acorn.d.ts',
      ],
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
        '@napi-rs/canvas',
        'bullmq',
        'openid-client',
        'pdfjs-dist',
        'stripe',
      ],
    },
    'apps/gateway': {
      entry: ['src/**/*.ts', 'src/**/*.test.ts'],
      project: ['src/**/*.ts'],
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
      ignoreDependencies: ['@napi-rs/canvas', '@latitude-data/eslint-config'], // pragma: allowlist secret
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
      ignoreDependencies: ['react-dom'],
    },
    'packages/cli': {
      project: ['src/**/*.ts'],
      ignore: ['src/**/*.test.ts'],
    },
    'packages/sdks/typescript': {
      entry: ['src/index.ts', 'src/tests/**/*.ts', 'src/**/*.test.ts'],
      project: ['src/**/*.ts'],
      ignoreDependencies: ['zod', '@opentelemetry/semantic-conventions'],
    },
    'packages/telemetry/typescript': {
      entry: ['src/index.ts'],
      project: ['src/**/*.ts'],
      ignore: ['src/**/*.test.ts', 'src/tests/**'],
    },
  },
  exclude: [
    'optionalPeerDependencies',
    'unlisted',
    'binaries',
    'unresolved',
    'devDependencies',
  ],
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
