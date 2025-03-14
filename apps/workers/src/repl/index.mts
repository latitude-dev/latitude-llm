import repl from 'node:repl'
import { database, dbUtils } from '@latitude-data/core/client'
import * as models from '@latitude-data/core/schema'

const env = process.env.NODE_ENV || 'development'
const redColor = (text: string) => `\x1b[31m${text}\x1b[0m`
const blueColor = (text: string) => `\x1b[34m${text}\x1b[0m`
const label =
  env === 'production'
    ? redColor(`latitude (${env})`)
    : blueColor(`latitude (${env})`)
const r = repl.start({
  prompt: `${label}: `,
  breakEvalOnSigint: true,
  useColors: true,
})

r.context.database = {
  ...dbUtils,
  ...models,
  db: database,
}
