import type { Config } from 'drizzle-kit'

const env = process.env.NODE_ENV || 'development'
const url =
  process.env.DATABASE_URL ||
  `postgres://latitude:secret@localhost:5432/latitude_${env}`

export default {
  dialect: 'postgresql',
  schema: [
    './src/schema/db-schema.ts',
    './src/schema/models',
    './src/schema/legacyModels',
  ],
  out: './drizzle',
  dbCredentials: {
    url,
  },
} satisfies Config
