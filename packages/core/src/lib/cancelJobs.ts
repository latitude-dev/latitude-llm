import { cache as redis } from '@latitude-data/core/cache'

const CANCEL_JOB_FLAG_TTL = 60 * 60 // 1 hour

export async function setCancelJobFlag(jobId: string) {
  const redisClient = await redis()
  await redisClient.set(`cancel:${jobId}`, '1', 'EX', CANCEL_JOB_FLAG_TTL)
}

export async function isJobCancelled(jobId: string): Promise<boolean> {
  const redisClient = await redis()
  return (await redisClient.get(`cancel:${jobId}`)) === '1'
}

export async function clearCancelJobFlag(jobId: string) {
  const redisClient = await redis()
  await redisClient.del(`cancel:${jobId}`)
}
