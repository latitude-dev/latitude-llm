import path from 'path'
import { fileURLToPath } from 'url'

import dotenv from 'dotenv'

const DIRNAME = path.dirname(fileURLToPath(import.meta.url))

const env = process.env.NODE_ENV || 'development'

if (env !== 'production') {
  // Don't write production .env files!
  const url = path.join(DIRNAME, `./env/${env}.env`)
  const result = dotenv.config({
    path: url,
  })

  if (result.error) {
    throw result.error
  }
}
