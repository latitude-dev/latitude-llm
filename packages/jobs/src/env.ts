import z from 'zod'

import '@latitude-data/env'

const envvars = z.object({
  NODE_ENV: z.string(),
  REDIS_HOST: z.string(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_PORT: z.string(),
  DATABASE_URL: z.string(),
})

export default envvars.parse(process.env)

declare global {
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof envvars> {}
  }
}
