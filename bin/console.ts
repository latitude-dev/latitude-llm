#!/usr/bin/env -S NODE_DEBUG=latitude:debug pnpx dotenv-cli -e .env.development -- tsx

import { dirname, resolve } from 'node:path'
import { chdir } from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

chdir(resolve(__dirname, '../apps/console'))

import('../apps/console/src/index.ts')
