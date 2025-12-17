#!/usr/bin/env tsx
/**
 * Script to manually test the dailyAlignmentMetricUpdateJob
 *
 * Usage:
 *   pnpm --filter @latitude-data/core maintenance:testDailyAlignment
 *
 * Or directly:
 *   cd packages/core && npx tsx scripts/maintenance/test-daily-alignment-job.ts
 *
 * Options:
 *   --queue    Add job to queue (requires workers running)
 *   --direct   Run job function directly (default)
 */

import '@latitude-data/env'

import { Job } from 'bullmq'
import { dailyAlignmentMetricUpdateJob } from '../../src/jobs/job-definitions/maintenance/dailyAlignmentMetricUpdateJob'
import { queues } from '../../src/jobs/queues'

async function runDirect() {
  console.log('\n🔧 Running dailyAlignmentMetricUpdateJob directly...\n')
  console.log('='.repeat(80) + '\n')

  const startTime = Date.now()

  try {
    const mockJob = {} as Job
    await dailyAlignmentMetricUpdateJob(mockJob)

    const duration = Date.now() - startTime
    console.log('\n' + '='.repeat(80))
    console.log(`\n✅ Job completed successfully in ${duration}ms\n`)
  } catch (error) {
    const duration = Date.now() - startTime
    console.error('\n' + '='.repeat(80))
    console.error(`\n❌ Job failed after ${duration}ms:`, error)
    process.exit(1)
  }
}

async function addToQueue() {
  console.log('\n📤 Adding dailyAlignmentMetricUpdateJob to queue...\n')
  console.log('='.repeat(80) + '\n')

  try {
    const { maintenanceQueue } = await queues()

    const job = await maintenanceQueue.add(
      'dailyAlignmentMetricUpdateJob',
      {},
      { attempts: 1 },
    )

    console.log(`✅ Job added to queue!`)
    console.log(`   Job ID: ${job.id}`)
    console.log(`   Job Name: ${job.name}`)
    console.log('\n📋 To monitor the job:')
    console.log('   1. Make sure workers are running (pnpm dev)')
    console.log('   2. Check BullMQ admin: http://localhost:3000/admin/queues')
    console.log('   3. Watch worker logs for output\n')

    // Give time for the job to be picked up
    await new Promise((resolve) => setTimeout(resolve, 1000))
    process.exit(0)
  } catch (error) {
    console.error('❌ Failed to add job to queue:', error)
    process.exit(1)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const useQueue = args.includes('--queue')

  console.log('\n' + '='.repeat(80))
  console.log('  Daily Alignment Metric Update Job - Manual Test')
  console.log('='.repeat(80))

  if (useQueue) {
    await addToQueue()
  } else {
    await runDirect()
  }
}

main().catch((error) => {
  console.error('❌ Script failed:', error)
  process.exit(1)
})
