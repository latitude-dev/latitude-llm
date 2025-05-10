import { Redis } from 'ioredis'
import { env } from '@latitude-data/env'
import { buildRedisConnection } from '../../redis'

export type TrackedProgress = {
  total: number
  completed: number
  errors: number
  enqueued: number
  failed: number
  totalScore: number
}

export class ProgressTracker {
  private redis: Redis | null = null

  constructor(private batchId: string) {}

  private async ensureConnection() {
    if (!this.redis) {
      const redisOptions: any = {
        // Use 'any' or a more specific type for options
        host: env.CACHE_HOST,
        port: env.CACHE_PORT,
      }
      if (env.CACHE_PASSWORD) {
        redisOptions.password = env.CACHE_PASSWORD
      }
      this.redis = await buildRedisConnection(redisOptions)
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
    multi.set(this.getKey('failed'), 0)
    multi.set(this.getKey('totalScore'), 0)

    await multi.exec()
  }

  async incrementCompleted(count?: number) {
    const redis = await this.ensureConnection()
    await redis.incrby(this.getKey('completed'), count ?? 1)
  }

  async incrementFailed(count?: number) {
    const redis = await this.ensureConnection()
    await redis.incrby(this.getKey('failed'), count ?? 1)
  }

  async incrementErrors(count?: number) {
    const redis = await this.ensureConnection()
    await redis.incrby(this.getKey('errors'), count ?? 1)
  }

  async incrementEnqueued(count?: number) {
    const redis = await this.ensureConnection()
    await redis.incrby(this.getKey('enqueued'), count ?? 1)
  }

  async incrementTotalScore(count?: number) {
    const redis = await this.ensureConnection()
    await redis.incrby(this.getKey('totalScore'), count ?? 1)
  }

  async getProgress(): Promise<TrackedProgress> {
    const redis = await this.ensureConnection()
    const [total, completed, errors, enqueued, failed, totalScore] =
      await redis.mget([
        this.getKey('total'),
        this.getKey('completed'),
        this.getKey('errors'),
        this.getKey('enqueued'),
        this.getKey('failed'),
        this.getKey('totalScore'),
      ])

    return {
      total: parseInt(total || '0', 10),
      completed: parseInt(completed || '0', 10),
      errors: parseInt(errors || '0', 10),
      enqueued: parseInt(enqueued || '0', 10),
      failed: parseInt(failed || '0', 10),
      totalScore: parseInt(totalScore || '0', 10),
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
