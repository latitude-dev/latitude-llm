import { describe, it, expect, vi, beforeEach } from 'vitest'
import { notifyClientOfRunStatusByDocument } from './notifyClientOfRunStatusByDocument'
import { WebsocketClient } from '../../websockets/workers'
import { LogSources } from '@latitude-data/constants'
import { DocumentRunStatusEvent } from '../events'

vi.mock('../../websockets/workers', () => ({
  WebsocketClient: {
    sendEvent: vi.fn(),
  },
}))

describe('notifyClientOfRunStatusByDocument', () => {
  const baseEventData = {
    workspaceId: 1,
    projectId: 2,
    documentUuid: 'doc-uuid-123',
    commitUuid: 'commit-uuid-456',
    run: {
      uuid: 'run-uuid-789',
      queuedAt: new Date('2025-01-01T00:00:00Z'),
      documentUuid: 'doc-uuid-123',
      commitUuid: 'commit-uuid-456',
      source: LogSources.API,
    },
    eventContext: 'background' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should not send event when eventContext is foreground', async () => {
    const event = {
      type: 'documentRunQueued',
      data: {
        ...baseEventData,
        eventContext: 'foreground' as const,
      },
    } as DocumentRunStatusEvent

    await notifyClientOfRunStatusByDocument({ data: event })

    expect(WebsocketClient.sendEvent).not.toHaveBeenCalled()
  })

  it('should send documentRunStatus event for documentRunQueued', async () => {
    const event = {
      type: 'documentRunQueued',
      data: baseEventData,
    } as DocumentRunStatusEvent

    await notifyClientOfRunStatusByDocument({ data: event })

    expect(WebsocketClient.sendEvent).toHaveBeenCalledWith(
      'documentRunStatus',
      {
        workspaceId: baseEventData.workspaceId,
        data: {
          event: 'documentRunQueued',
          eventContext: 'background',
          workspaceId: baseEventData.workspaceId,
          projectId: baseEventData.projectId,
          documentUuid: baseEventData.documentUuid,
          commitUuid: baseEventData.commitUuid,
          run: baseEventData.run,
        },
      },
    )
  })

  it('should send documentRunStatus event for documentRunStarted', async () => {
    const eventData = {
      ...baseEventData,
      run: {
        ...baseEventData.run,
        startedAt: new Date('2025-01-01T00:00:01Z'),
      },
    }
    const event = {
      type: 'documentRunStarted',
      data: eventData,
    } as DocumentRunStatusEvent

    await notifyClientOfRunStatusByDocument({ data: event })

    expect(WebsocketClient.sendEvent).toHaveBeenCalledWith(
      'documentRunStatus',
      {
        workspaceId: eventData.workspaceId,
        data: {
          event: 'documentRunStarted',
          eventContext: 'background',
          workspaceId: eventData.workspaceId,
          projectId: eventData.projectId,
          documentUuid: eventData.documentUuid,
          commitUuid: eventData.commitUuid,
          run: eventData.run,
        },
      },
    )
  })

  it('should send documentRunStatus event for documentRunProgress', async () => {
    const eventData = {
      ...baseEventData,
      run: {
        ...baseEventData.run,
        startedAt: new Date('2025-01-01T00:00:01Z'),
        caption: 'Processing...',
      },
    }
    const event = {
      type: 'documentRunProgress',
      data: eventData,
    } as DocumentRunStatusEvent

    await notifyClientOfRunStatusByDocument({ data: event })

    expect(WebsocketClient.sendEvent).toHaveBeenCalledWith(
      'documentRunStatus',
      {
        workspaceId: eventData.workspaceId,
        data: {
          event: 'documentRunProgress',
          eventContext: 'background',
          workspaceId: eventData.workspaceId,
          projectId: eventData.projectId,
          documentUuid: eventData.documentUuid,
          commitUuid: eventData.commitUuid,
          run: eventData.run,
        },
      },
    )
  })

  it('should send documentRunStatus event for documentRunEnded', async () => {
    const eventData = {
      ...baseEventData,
      run: {
        ...baseEventData.run,
        startedAt: new Date('2025-01-01T00:00:01Z'),
        caption: 'Completed',
      },
    }
    const event = {
      type: 'documentRunEnded',
      data: eventData,
    } as DocumentRunStatusEvent

    await notifyClientOfRunStatusByDocument({ data: event })

    expect(WebsocketClient.sendEvent).toHaveBeenCalledWith(
      'documentRunStatus',
      {
        workspaceId: eventData.workspaceId,
        data: {
          event: 'documentRunEnded',
          eventContext: 'background',
          workspaceId: eventData.workspaceId,
          projectId: eventData.projectId,
          documentUuid: eventData.documentUuid,
          commitUuid: eventData.commitUuid,
          run: eventData.run,
        },
      },
    )
  })

  it('should include optional fields when present', async () => {
    const eventData = {
      ...baseEventData,
      parameters: { key: 'value' },
      customIdentifier: 'custom-id',
      tools: ['tool1', 'tool2'],
      userMessage: 'Hello',
    }
    const event = {
      type: 'documentRunQueued',
      data: eventData,
    } as DocumentRunStatusEvent

    await notifyClientOfRunStatusByDocument({ data: event })

    expect(WebsocketClient.sendEvent).toHaveBeenCalledWith(
      'documentRunStatus',
      {
        workspaceId: eventData.workspaceId,
        data: {
          event: 'documentRunQueued',
          eventContext: 'background',
          workspaceId: eventData.workspaceId,
          projectId: eventData.projectId,
          documentUuid: eventData.documentUuid,
          commitUuid: eventData.commitUuid,
          run: eventData.run,
        },
      },
    )
  })
})
