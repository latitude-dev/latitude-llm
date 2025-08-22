import { cache as redis } from '@latitude-data/core/cache'

const redisClient = await redis()

export async function setCancelJobFlag(jobId: string) {
  await redisClient.set(`cancel:${jobId}`, '1')
}

export async function isJobCancelled(jobId: string): Promise<boolean> {
  return (await redisClient.get(`cancel:${jobId}`)) === '1'
}

export async function clearCancelJobFlag(jobId: string) {
  await redisClient.del(`cancel:${jobId}`)
}
