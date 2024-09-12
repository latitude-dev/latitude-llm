import { setupWorkers } from '@latitude-data/jobs'

const workers = setupWorkers()

console.log('Workers started')

const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, closing workers...`)

  await Promise.all(workers.map((w) => w.close()))

  process.exit(0)
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
