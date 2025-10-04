import { defineConfig } from 'rollup'

// Common Plugins
import { nodeResolve } from '@rollup/plugin-node-resolve'
import typescript from 'rollup-plugin-typescript2'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import manifestPlugin from 'rollup-plugin-output-manifest'

const outputManifest = manifestPlugin.default

// Production plugins
import terser from '@rollup/plugin-terser'

const isProduction = process.env.NODE_ENV === 'production'

export default defineConfig({
  input: 'src/workers/readMetadata.ts',
  output: {
    entryFileNames: 'readMetadata.[hash].js',
    dir: 'public/workers',
    format: 'iife',
  },
  treeshake: 'smallest',
  plugins: [
    nodeResolve({ browser: true, preferBuiltins: false }),
    commonjs({ transformMixedEsModules: true }),
    json(),
    typescript({
      tsconfig: './tsconfig.workers.json',
    }),
    outputManifest({
      fileName: 'worker-manifest.json',
      publicPath: '/workers/',
    }),
    isProduction && terser(),
  ].filter(Boolean),
})
