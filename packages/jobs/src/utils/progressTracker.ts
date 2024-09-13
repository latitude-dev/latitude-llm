import { Redis } from 'ioredis'

export class ProgressTracker {
  constructor(
    private redis: Redis,
    private batchId: string,
  ) {}

  async initializeProgress(total: number) {
    const multi = this.redis.multi()
    multi.set(this.getKey('initialTotal'), total)
    multi.set(this.getKey('total'), total)
    multi.set(this.getKey('completed'), 0)
    multi.set(this.getKey('errors'), 0)
    await multi.exec()
  }

  async incrementCompleted() {
    await this.redis.incr(this.getKey('completed'))
  }

  async incrementErrors() {
    await this.redis.incr(this.getKey('errors'))
  }

  async decrementTotal() {
    await this.redis.decr(this.getKey('total'))
  }

  async incrementEnqueued() {
    await this.redis.incr(this.getKey('enqueued'))
  }

  async getProgress() {
    const [initialTotal, total, completed, errors, enqueued] =
      await this.redis.mget([
        this.getKey('initialTotal'),
        this.getKey('total'),
        this.getKey('completed'),
        this.getKey('errors'),
        this.getKey('enqueued'),
      ])
    return {
      initialTotal: parseInt(initialTotal || '0', 10),
      total: parseInt(total || '0', 10),
      completed: parseInt(completed || '0', 10),
      errors: parseInt(errors || '0', 10),
      enqueued: parseInt(enqueued || '0', 10),
    }
  }

  async isFinished() {
    const { enqueued, completed, errors } = await this.getProgress()
    return enqueued === completed + errors
  }

  private getKey(suffix: string) {
    return `batch:${this.batchId}:${suffix}`
  }
}
