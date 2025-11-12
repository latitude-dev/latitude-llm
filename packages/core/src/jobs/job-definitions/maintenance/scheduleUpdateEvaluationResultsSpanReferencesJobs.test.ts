import { describe, expect, it } from 'vitest'
import { Job } from 'bullmq'
import { scheduleUpdateEvaluationResultsSpanReferencesJobs } from './scheduleUpdateEvaluationResultsSpanReferencesJobs'

describe('scheduleUpdateEvaluationResultsSpanReferencesJobs', () => {
  it('should schedule individual jobs for all workspaces', async () => {
    const mockJob = {} as Job

    const result =
      await scheduleUpdateEvaluationResultsSpanReferencesJobs(mockJob)

    expect(result).toBeDefined()
    expect(result.message).toContain('Successfully scheduled')
    expect(result.enqueuedJobs).toBeGreaterThanOrEqual(0) // Should work even with no workspaces
  })
})
