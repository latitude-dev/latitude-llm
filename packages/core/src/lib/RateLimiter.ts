import { ReplyError } from 'ioredis'
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible'
import { cache } from '../cache'
import { RateLimitError } from './errors'
import { Result } from './Result'

const DEFAULT_RATE_LIMIT_POINTS = 1000
const DEFAULT_RATE_LIMIT_DURATION = 60

export default class RateLimiter {
  private limit: number
  private period: number
  private limiter?: RateLimiterRedis

  private static async _construct(limit: number, period: number) {
    return new RateLimiterRedis({
      storeClient: await cache(),
      points: limit,
      duration: period,
    })
  }

  constructor({
    limit = DEFAULT_RATE_LIMIT_POINTS,
    period = DEFAULT_RATE_LIMIT_DURATION,
  }: {
    limit?: number
    period?: number
  } = {}) {
    this.limit = limit
    this.period = period
    RateLimiter._construct(limit, period).then((limiter) => {
      this.limiter = limiter
    })
  }

  async consume(key: string, points: number = 1) {
    if (!this.limiter) {
      this.limiter = await RateLimiter._construct(this.limit, this.period)
    }

    try {
      await this.limiter.consume(key, points)
    } catch (error) {
      if (error instanceof RateLimiterRes) {
        return Result.error(new RateLimitError('Too many requests'))
      }

      if (!(error instanceof ReplyError)) {
        return Result.error(error as Error)
      }
    }

    return Result.nil()
  }
}
