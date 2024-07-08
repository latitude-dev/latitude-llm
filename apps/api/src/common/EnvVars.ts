import '@latitude-data/env'

import path from 'path'
import { fileURLToPath } from 'url'

import dotenv from 'dotenv'
import z from 'zod'

const DIRNAME = path.dirname(fileURLToPath(import.meta.url))

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({
    path: path.join(DIRNAME, `../../env/${process.env.NODE_ENV}.env`),
  })
}

const envvars = z.object({
  NODE_ENV: z.string(),
  PORT: z.string(),
  ELASTIC_USERNAME: z.string(),
  ELASTIC_PASSWORD: z.string(),
  ELASTIC_URL: z.string(),
})

export default envvars.parse(process.env)

declare global {
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof envvars> {}
  }
}
