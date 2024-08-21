import { setupWorkers } from '@latitude-data/jobs'
import env from '$/env'

console.log('Workers starting...')

const workers = setupWorkers({
  connectionParams: {
    host: env.REDIS_HOST,
    port: Number(env.REDIS_PORT),
    password: env.REDIS_PASSWORD,
  },
})

const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, closing workers...`)

  await Promise.all(workers.map((w) => w.close()))

  process.exit(0)
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
