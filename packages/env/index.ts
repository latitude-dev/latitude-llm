import path from 'path'

import dotenv from 'dotenv'

const env = process.env.NODE_ENV || 'development'
if (env !== 'production') {
  // Don't write production .env files!

  const url = path.join(__dirname, `./env/${env}.env`)
  const result = dotenv.config({
    path: url,
  })

  if (result.error) {
    throw result.error
  }
}
