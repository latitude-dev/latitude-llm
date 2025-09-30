import { cache } from '@latitude-data/core/cache'
import { database, utils } from '@latitude-data/core/client'
import * as migrations from '@latitude-data/core/data-migrations'
import * as repositories from '@latitude-data/core/repositories'
import * as models from '@latitude-data/core/schema'
import { randomUUID as uuid } from 'node:crypto'
import repl from 'node:repl'
import { inspect as utilInspect } from 'node:util'
import { setupReplHistory } from './replHistory'
import * as loadModules from './replReload'

const inspect = (value: any) => console.log(utilInspect(value, { depth: null }))

const hasS3 = process.env.S3_BUCKET

const redColor = (text: string) => `\x1b[31m${text}\x1b[0m`
const blueColor = (text: string) => `\x1b[34m${text}\x1b[0m`
const label = hasS3
  ? redColor(`latitude (production)`)
  : blueColor(`latitude (development)`)

const r = repl.start({
  prompt: `${label} `,
  breakEvalOnSigint: true,
  useColors: true,
})

// History in Repl enabled
setupReplHistory(r)

Object.assign(r.context, {
  ...utils,
  ...models,
  database,
  cache,
  ...migrations,
  ...repositories,
  uuid,
  inspect,
  ...loadModules,
})
