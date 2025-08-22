import { cache as redis } from '@latitude-data/core/cache'

const redisClient = await redis()

export async function cancelJob(BullMQjobId: string) {
  await redisClient.set(`cancel:${BullMQjobId}`, '1')
}

export async function isJobCancelled(BullMQjobId: string): Promise<boolean> {
  console.log(`👀 Checking cancellation status for job ${BullMQjobId}`)
  return (await redisClient.get(`cancel:${BullMQjobId}`)) === '1'
}

export async function clearJobCancellation(BullMQjobId: string) {
  console.log(`🧹 Clearing cancellation flag for job ${BullMQjobId}`)
  await redisClient.del(`cancel:${BullMQjobId}`)
}
