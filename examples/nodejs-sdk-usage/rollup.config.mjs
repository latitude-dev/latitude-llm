import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

export default {
  input: 'src/run.ts',
  output: {
    file: 'dist/run.js',
    format: 'esm',
    sourcemap: true,
  },
  plugins: [resolve(), commonjs(), typescript()],
  external: ['@latitude-data/sdk', 'node-fetch'],
}
