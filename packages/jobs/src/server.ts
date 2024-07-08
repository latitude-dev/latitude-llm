import { buildConnection } from '$jobs/connection'
import env from '$jobs/env'
import startWorkers from '$jobs/workers'
import { Worker } from 'bullmq'

const connection = buildConnection({
  host: env.REDIS_HOST,
  port: Number(env.REDIS_PORT),
  password: env.REDIS_PASSWORD,
})

const workers = startWorkers({ connection })

console.log('Workers started')

const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, closing workers...`)

  await Promise.all(workers.map((w: Worker) => w.close()))

  process.exit(0)
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
