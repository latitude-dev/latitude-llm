import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Job } from 'bullmq'
import { createWorkspace } from '../../../tests/factories'
import { createSpan } from '../../../tests/factories/spans'
import { SpanType } from '../../../constants'
import { scheduleWeeklyEmailJobs } from './scheduleWeeklyEmailJobs'
import * as queuesModule from '../../queues'

describe('scheduleWeeklyEmailJobs', () => {
  let mockAdd: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockAdd = vi.fn()
    vi.spyOn(queuesModule, 'queues').mockResolvedValue({
      notificationsQueue: { add: mockAdd },
      eventsQueue: { add: vi.fn() },
      webhooksQueue: { add: vi.fn() },
    } as any)
  })

  it('enqueues jobs for active workspaces', async () => {
    const { workspace: workspace1 } = await createWorkspace()
    const { workspace: workspace2 } = await createWorkspace()

    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    await createSpan({
      workspaceId: workspace1.id,
      type: SpanType.Prompt,
      startedAt: threeDaysAgo,
    })

    await createSpan({
      workspaceId: workspace2.id,
      type: SpanType.Prompt,
      startedAt: threeDaysAgo,
    })

    await scheduleWeeklyEmailJobs({} as Job)

    expect(mockAdd).toHaveBeenCalledWith(
      'sendWeeklyEmailJob',
      { workspaceId: workspace1.id },
      { attempts: 3 },
    )
    expect(mockAdd).toHaveBeenCalledWith(
      'sendWeeklyEmailJob',
      { workspaceId: workspace2.id },
      { attempts: 3 },
    )
  })

  it('does not enqueue jobs for workspaces with old activity', async () => {
    const { workspace } = await createWorkspace()

    const fiveWeeksAgo = new Date()
    fiveWeeksAgo.setDate(fiveWeeksAgo.getDate() - 35)

    await createSpan({
      workspaceId: workspace.id,
      type: SpanType.Prompt,
      startedAt: fiveWeeksAgo,
    })

    await scheduleWeeklyEmailJobs({} as Job)
    expect(mockAdd).not.toHaveBeenCalledWith(
      'sendWeeklyEmailJob',
      { workspaceId: workspace.id },
      expect.any(Object),
    )
  })

  it('does not enqueue jobs for big accounts', async () => {
    const { workspace: bigWorkspace } = await createWorkspace({
      isBigAccount: true,
    })

    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

    await createSpan({
      workspaceId: bigWorkspace.id,
      type: SpanType.Prompt,
      startedAt: threeDaysAgo,
    })

    await scheduleWeeklyEmailJobs({} as Job)

    expect(mockAdd).not.toHaveBeenCalledWith(
      'sendWeeklyEmailJob',
      { workspaceId: bigWorkspace.id },
      expect.any(Object),
    )
  })

  it('does not enqueue jobs when no active workspaces', async () => {
    await createWorkspace()

    await scheduleWeeklyEmailJobs({} as Job)

    expect(mockAdd).not.toHaveBeenCalled()
  })

  it('handles multiple workspaces with mixed activity', async () => {
    const { workspace: activeWorkspace } = await createWorkspace()
    const { workspace: inactiveWorkspace } = await createWorkspace()
    const { workspace: bigWorkspace } = await createWorkspace({
      isBigAccount: true,
    })

    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

    await createSpan({
      workspaceId: activeWorkspace.id,
      type: SpanType.Prompt,
      startedAt: threeDaysAgo,
    })

    await createSpan({
      workspaceId: bigWorkspace.id,
      type: SpanType.Prompt,
      startedAt: threeDaysAgo,
    })

    await scheduleWeeklyEmailJobs({} as Job)

    expect(mockAdd).toHaveBeenCalledWith(
      'sendWeeklyEmailJob',
      { workspaceId: activeWorkspace.id },
      { attempts: 3 },
    )

    expect(mockAdd).not.toHaveBeenCalledWith(
      'sendWeeklyEmailJob',
      { workspaceId: bigWorkspace.id },
      expect.any(Object),
    )
    expect(mockAdd).not.toHaveBeenCalledWith(
      'sendWeeklyEmailJob',
      { workspaceId: inactiveWorkspace.id },
      expect.any(Object),
    )
  })
})
