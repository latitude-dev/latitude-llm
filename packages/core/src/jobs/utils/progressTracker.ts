import { Redis } from 'ioredis'
import { env } from '@latitude-data/env'
import { buildRedisConnection } from '../../redis'

export class ProgressTracker {
  private redis: Redis | null = null

  constructor(private batchId: string) {}

  private async ensureConnection() {
    if (!this.redis) {
      this.redis = await buildRedisConnection({
        host: env.CACHE_HOST,
        port: env.CACHE_PORT,
      })
    }

    return this.redis as Redis
  }

  async initializeProgress(total: number) {
    const redis = await this.ensureConnection()
    const multi = redis.multi()

    multi.set(this.getKey('total'), total)
    multi.set(this.getKey('completed'), 0)
    multi.set(this.getKey('enqueued'), 0)
    multi.set(this.getKey('errors'), 0)

    await multi.exec()
  }

  async incrementCompleted() {
    const redis = await this.ensureConnection()
    await redis.incr(this.getKey('completed'))
  }

  async incrementErrors() {
    const redis = await this.ensureConnection()
    await redis.incr(this.getKey('errors'))
  }

  async incrementEnqueued() {
    const redis = await this.ensureConnection()
    await redis.incr(this.getKey('enqueued'))
  }

  async getProgress() {
    const redis = await this.ensureConnection()
    const [total, completed, errors, enqueued] = await redis.mget([
      this.getKey('total'),
      this.getKey('completed'),
      this.getKey('errors'),
      this.getKey('enqueued'),
    ])

    return {
      total: parseInt(total || '0', 10),
      completed: parseInt(completed || '0', 10),
      errors: parseInt(errors || '0', 10),
      enqueued: parseInt(enqueued || '0', 10),
    }
  }

  async cleanup() {
    if (this.redis) {
      await this.redis.quit()
      this.redis = null
    }
  }

  private getKey(suffix: string) {
    return `batch:${this.batchId}:${suffix}`
  }
}
