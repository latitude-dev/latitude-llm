import { env } from '@latitude-data/env'
import { Redis, RedisOptions } from 'ioredis'
import { buildRedisConnection, REDIS_KEY_PREFIX } from '../../redis'

export type TrackedProgress = {
  total: number // Total number of rows to process
  completed: number // Rows completed
  passed: number // Evaluations passed
  failed: number // Evaluations failed
  errors: number // Evaluations that failed with an error or did not execute due to an error in the document
  totalScore: number
}

export class ProgressTracker {
  private redis: Redis | null = null
  private evaluationsPerRow?: number = undefined

  constructor(private batchId: string) {}

  private async ensureConnection() {
    if (!this.redis) {
      const redisOptions: RedisOptions = {
        // Use 'any' or a more specific type for options
        host: env.CACHE_HOST,
        port: env.CACHE_PORT,
        keyPrefix: REDIS_KEY_PREFIX,
      }
      if (env.CACHE_PASSWORD) {
        redisOptions.password = env.CACHE_PASSWORD
      }
      this.redis = await buildRedisConnection(redisOptions)
    }

    return this.redis as Redis
  }

  async initializeProgress(uuids: string[], evaluationsPerRow: number) {
    const redis = await this.ensureConnection()
    const multi = redis.multi()

    multi.set(this.getKey('totalRows'), uuids.length)
    multi.set(this.getKey('evaluationsPerRow'), evaluationsPerRow)

    multi.set(this.getKey('passed'), 0)
    multi.set(this.getKey('enqueued'), 0)
    multi.set(this.getKey('errors'), 0)
    multi.set(this.getKey('failed'), 0)
    multi.set(this.getKey('totalScore'), 0)

    await multi.exec()
  }

  private async getEvaluationsPerRow(redis: Redis) {
    if (this.evaluationsPerRow) return this.evaluationsPerRow
    this.evaluationsPerRow = await redis
      .get(this.getKey('evaluationsPerRow'))
      .then((v) => (v ? parseInt(v, 10) : 0))
    return this.evaluationsPerRow
  }

  private async incrementRow(redis: Redis, uuid: string, count?: number) {
    const newCount = await redis.hincrby(this.getKey('rows'), uuid, count ?? 1)
    const evaluationsPerRow = await this.getEvaluationsPerRow(redis)

    if (newCount === 1 + evaluationsPerRow) {
      // If row is complete (1 for document run + all evaluations)
      await redis.incrby(this.getKey('completed'), 1)
    }
  }

  async documentRunFinished(uuid: string, success: boolean) {
    const redis = await this.ensureConnection()

    const evaluationsPerRow = await this.getEvaluationsPerRow(redis)
    const incrementCount = success ? 1 : 1 + evaluationsPerRow // If failed, evaluations will be marked as done too since they will not run

    if (!success && evaluationsPerRow > 0) {
      // Mark this row's evaluations as errors
      await redis.incrby(this.getKey('errors'), evaluationsPerRow)
    }

    return this.incrementRow(redis, uuid, incrementCount)
  }

  async evaluationError(uuid: string) {
    const redis = await this.ensureConnection()

    await redis.incrby(this.getKey('errors'), 1)
    return this.incrementRow(redis, uuid)
  }

  async evaluationFinished(
    uuid: string,
    {
      passed,
      score,
    }: {
      passed: boolean
      score: number
    },
  ) {
    const redis = await this.ensureConnection()

    await redis.incrby(this.getKey(passed ? 'passed' : 'failed'), 1)
    await redis.incrby(this.getKey('totalScore'), score)

    return this.incrementRow(redis, uuid)
  }

  async getProgress(): Promise<TrackedProgress> {
    const redis = await this.ensureConnection()
    const [totalRows, completed, passed, failed, errors, totalScore] =
      await redis
        .mget([
          this.getKey('totalRows'),
          this.getKey('completed'),
          this.getKey('passed'),
          this.getKey('failed'),
          this.getKey('errors'),
          this.getKey('totalScore'),
        ])
        .then((v) => v.map(Number))

    return {
      total: totalRows,
      completed,

      passed,
      failed,
      errors,

      totalScore,
    }
  }

  async cleanup() {
    if (this.redis) {
      // Delete all keys associated with this batch
      const keys = [
        this.getKey('passed'),
        this.getKey('enqueued'),
        this.getKey('errors'),
        this.getKey('failed'),
        this.getKey('totalScore'),
        this.getKey('rows'),
      ]
      await this.redis.del(...keys)
      await this.redis.quit()
      this.redis = null
    }
  }

  private getKey(suffix: string) {
    return `batch:${this.batchId}:${suffix}`
  }
}
