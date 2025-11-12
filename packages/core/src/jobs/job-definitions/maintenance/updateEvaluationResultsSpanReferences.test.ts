import { describe, expect, it } from 'vitest'
import { Job } from 'bullmq'
import { updateEvaluationResultsSpanReferencesJob } from './updateEvaluationResultsSpanReferencesJob'

describe('updateEvaluationResultsSpanReferencesJob', () => {
  it('should run without errors', async () => {
    // This is a simple smoke test to ensure the job can run
    const mockJob = {
      data: { workspaceId: 1 },
    } as Job<{ workspaceId: number }>

    // The job should complete successfully even with no data to process
    const result = await updateEvaluationResultsSpanReferencesJob(mockJob)

    expect(result).toBeDefined()
    if ('error' in result) {
      // If it's an error result, it should be a workspace not found error
      expect(result.error.message).toContain('not found')
    } else {
      // If it's a success result, it should have the expected structure
      expect(result.message).toContain('Successfully updated')
      expect(result.updatedCount).toBeGreaterThanOrEqual(0)
      expect(result.workspaceId).toBe(1)
    }
  })
})
