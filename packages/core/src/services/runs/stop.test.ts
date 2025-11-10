import { beforeEach, describe, expect, it, vi } from 'vitest'
import { publisher } from '../../events/publisher'
import { queues } from '../../jobs/queues'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { deleteActiveRun } from './active/delete'
import { type Project } from '../../schema/models/types/Project'
import { type Workspace } from '../../schema/models/types/Workspace'

import { stopRun } from './stop'

vi.mock('../../jobs/queues')
vi.mock('../../events/publisher')
vi.mock('./active/delete')

describe('stopRun', () => {
  const mockWorkspace = { id: 1 } as Workspace
  const mockProject = { id: 1 } as Project
  const mockRun = {
    uuid: 'test-uuid',
    endedAt: null,
  } as any

  const mockQueue = {
    getJob: vi.fn(),
  }

  const mockJob = {
    id: 'job-123',
    getState: vi.fn(),
    waitUntilFinished: vi.fn(),
    remove: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(queues).mockResolvedValue({
      runsQueue: mockQueue as any,
    } as any)
  })

  describe('when run has already ended', () => {
    it('returns UnprocessableEntityError', async () => {
      // @ts-expect-error - mock
      const endedRun = { ...mockRun, endedAt: new Date() } as Run

      const result = await stopRun({
        run: endedRun,
        project: mockProject,
        workspace: mockWorkspace,
      })

      expect(result.error).toBeInstanceOf(UnprocessableEntityError)
      expect(result.error?.message).toBe('Run already ended')
      expect(mockQueue.getJob).not.toHaveBeenCalled()
    })
  })

  describe('when job is not found', () => {
    it('handles stale run cleanup when run exists in repository', async () => {
      mockQueue.getJob.mockResolvedValueOnce(null)

      vi.mocked(deleteActiveRun).mockResolvedValueOnce(
        Result.ok(undefined as any),
      )

      const result = await stopRun({
        run: mockRun,
        project: mockProject,
        workspace: mockWorkspace,
      })

      expect(result.ok).toBe(true)
      expect(deleteActiveRun).toHaveBeenCalledWith({
        workspaceId: mockWorkspace.id,
        projectId: mockProject.id,
        runUuid: mockRun.uuid,
      })
    })

    it('handles repository delete failure gracefully', async () => {
      mockQueue.getJob.mockResolvedValueOnce(null)

      vi.mocked(deleteActiveRun).mockResolvedValueOnce(
        Result.error(new Error('Delete failed')),
      )

      const result = await stopRun({
        run: mockRun,
        project: mockProject,
        workspace: mockWorkspace,
      })

      expect(result.ok).toBe(false)
    })
  })

  describe('when job is found', () => {
    beforeEach(() => {
      mockQueue.getJob.mockResolvedValueOnce(mockJob)
    })

    it('publishes cancelJob event when job is not finished', async () => {
      mockJob.getState.mockResolvedValueOnce('active')
      mockJob.waitUntilFinished.mockResolvedValueOnce(undefined)
      mockJob.remove.mockResolvedValueOnce(undefined)

      const result = await stopRun({
        run: mockRun,
        project: mockProject,
        workspace: mockWorkspace,
      })

      expect(publisher.publish).toHaveBeenCalledWith('cancelJob', {
        jobId: mockJob.id,
      })
      expect(result.ok).toBe(true)
    })

    it('does not publish cancelJob event when job is already finished', async () => {
      mockJob.getState.mockResolvedValueOnce('completed')
      mockJob.remove.mockResolvedValueOnce(undefined)

      const result = await stopRun({
        run: mockRun,
        project: mockProject,
        workspace: mockWorkspace,
      })

      expect(publisher.publish).not.toHaveBeenCalled()
      expect(result.ok).toBe(true)
    })

    it('handles job state check failure', async () => {
      mockJob.getState.mockRejectedValueOnce(new Error('State check failed'))
      mockJob.remove.mockResolvedValueOnce(undefined)

      const result = await stopRun({
        run: mockRun,
        project: mockProject,
        workspace: mockWorkspace,
      })

      expect(publisher.publish).not.toHaveBeenCalled()
      expect(result.ok).toBe(true)
    })

    it('handles waitUntilFinished timeout gracefully', async () => {
      mockJob.getState.mockResolvedValueOnce('active')
      mockJob.waitUntilFinished.mockRejectedValueOnce(new Error('Timeout'))
      mockJob.remove.mockResolvedValueOnce(undefined)

      const result = await stopRun({
        run: mockRun,
        project: mockProject,
        workspace: mockWorkspace,
      })

      expect(publisher.publish).toHaveBeenCalledWith('cancelJob', {
        jobId: mockJob.id,
      })
      expect(result.ok).toBe(true)
    })

    it('handles job remove failure gracefully', async () => {
      mockJob.getState.mockResolvedValueOnce('active')
      mockJob.waitUntilFinished.mockResolvedValueOnce(undefined)
      mockJob.remove.mockRejectedValueOnce(new Error('Remove failed'))

      const result = await stopRun({
        run: mockRun,
        project: mockProject,
        workspace: mockWorkspace,
      })

      expect(result.ok).toBe(true)
    })
  })
})
