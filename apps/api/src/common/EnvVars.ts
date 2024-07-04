import path from 'path'

import dotenv from 'dotenv'
import z from 'zod'

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({
    path: path.join(__dirname, `../../env/${process.env.NODE_ENV}.env`),
  })
}

const envvars = z.object({
  NODE_ENV: z.string(),
  PORT: z.string(),
})

export default envvars.parse(process.env)

declare global {
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof envvars> {}
  }
}
