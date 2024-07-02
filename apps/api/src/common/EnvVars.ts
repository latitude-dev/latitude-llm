import z from 'zod'

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
