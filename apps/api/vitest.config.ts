import path from 'path'

import dotenv from 'dotenv'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

dotenv.config({
  path: path.join(__dirname, './env/test.env'),
})

export default defineConfig({
  plugins: [tsconfigPaths()],
})
