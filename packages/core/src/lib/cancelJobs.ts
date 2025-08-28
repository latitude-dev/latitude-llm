import { cache as redis } from '@latitude-data/core/cache'

const CANCEL_JOB_FLAG_TTL = 60 * 60 // 1 hour

const redisClient = await redis()

export async function setCancelJobFlag(jobId: string) {
  await redisClient.set(`cancel:${jobId}`, '1', 'EX', CANCEL_JOB_FLAG_TTL)
}

export async function isJobCancelled(jobId: string): Promise<boolean> {
  return (await redisClient.get(`cancel:${jobId}`)) === '1'
}

export async function clearCancelJobFlag(jobId: string) {
  await redisClient.del(`cancel:${jobId}`)
}
