import typescript from '@rollup/plugin-typescript'

/**
 * We have a internal circular dependency in the compiler,
 * which is intentional. We think in this case Rollup is too noisy.
 *
 * @param {import('rollup').RollupLog} warning
 * @returns {boolean}
 */
function isInternalCircularDependency(warning) {
  return (
    warning.code == 'CIRCULAR_DEPENDENCY' &&
    warning.message.includes('src/compiler') &&
    !warning.message.includes('node_modules')
  )
}

/** @type {import('rollup').RollupOptions} */
export default {
  onwarn: (warning, warn) => {
    if (isInternalCircularDependency(warning)) return

    warn(warning)
  },
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.js',
      sourcemap: true,
    },
  ],
  plugins: [
    typescript({
      exclude: ['**/__tests__', '**/*.test.ts'],
    }),
  ],
  external: ['acorn', 'locate-character', 'code-red', 'node:crypto', 'yaml', 'crypto', 'ajv'],
}
