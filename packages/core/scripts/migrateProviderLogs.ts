#!/usr/bin/env node

import { scheduleProviderLogsMigrationJobs } from '../jobs/job-definitions/maintenance/scheduleProviderLogsMigrationJobs'
import { Job } from 'bullmq'

/**
 * Script to manually trigger provider logs migration to object storage.
 * This will enqueue migration jobs for all workspaces that have old provider logs.
 *
 * Usage: pnpm run migrate:provider-logs
 */
async function main() {
  console.log('Starting provider logs migration to object storage...')

  try {
    // Create a mock job object
    const mockJob = {
      data: {},
      id: 'manual-trigger',
      name: 'scheduleProviderLogsMigrationJobs',
    } as Job

    const result = await scheduleProviderLogsMigrationJobs(mockJob)

    console.log('Migration jobs scheduled successfully:')
    console.log(
      `- Workspaces with old logs: ${result.workspacesWithOldLogsCount}`,
    )
    console.log(`- Enqueued jobs: ${result.enqueuedJobs}`)
    console.log('\nMigration jobs have been added to the maintenance queue.')
    console.log('Monitor the queue to track progress.')
  } catch (error) {
    console.error('Failed to schedule migration jobs:', error)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error)
  process.exit(1)
})
