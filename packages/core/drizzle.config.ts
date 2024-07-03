import type { Config } from 'drizzle-kit'

import env from './src/env'

const connectionString = env.DATABASE_URL

export default {
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: connectionString,
  },
} satisfies Config
