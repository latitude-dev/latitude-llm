import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { runCopilotChatJob } from './chat'
import * as dataAccess from '../../../data-access'
import {
  CommitsRepository,
  DocumentLogsRepository,
} from '../../../repositories'
import * as chatHelpers from '../../../services/copilot/chat/helpers'
import * as chatService from '../../../services/copilot/chat'
import { WebsocketClient } from '../../../websockets/workers'

describe('runCopilotChatJob', () => {
  let mockJob: Job<any>
  const workspace = { id: 1 }
  const project = { id: 2 }
  const commit = { id: 3 }
  const chatUuid = 'chat-uuid'
  const messageText = 'Hello, Copilot!'

  beforeEach(() => {
    vi.clearAllMocks()

    mockJob = {
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: commit.id,
        chatUuid,
        message: messageText,
        context: {
          path: '/some/path',
        },
      },
    } as Job<any>

    // default happy-path spies
    vi.spyOn(dataAccess, 'unsafelyFindWorkspace').mockResolvedValue(
      workspace as any,
    )
    vi.spyOn(dataAccess, 'unsafelyFindProject').mockResolvedValue(
      project as any,
    )
    vi.spyOn(CommitsRepository.prototype, 'find').mockResolvedValue({
      ok: true,
      unwrap: () => commit,
    } as any)
    vi.spyOn(chatHelpers, 'getCopilotDocument').mockResolvedValue({
      ok: true,
      unwrap: () => ({
        workspace: { id: 99 },
        commit: { id: 98 },
        document: { uuid: 'doc-123' },
      }),
    } as any)
    vi.spyOn(DocumentLogsRepository.prototype, 'findByUuid').mockResolvedValue({
      ok: false,
    } as any)
    vi.spyOn(WebsocketClient, 'sendEvent').mockResolvedValue({
      emit: vi.fn(),
    } as any)
    vi.spyOn(chatService, 'runNewCopilotChat').mockResolvedValue({
      ok: true,
      unwrap: vi.fn(),
    } as any)
    vi.spyOn(chatService, 'addMessageToExistingCopilotChat').mockResolvedValue({
      ok: true,
      unwrap: vi.fn(),
    } as any)
  })

  it('returns the copilotResult if getCopilotDocument fails', async () => {
    const commitOk = { ok: true, unwrap: () => commit }
    ;(CommitsRepository.prototype.find as any).mockResolvedValueOnce(commitOk)
    const copilotErr = { ok: false, error: new Error('copilot fail') }
    ;(chatHelpers.getCopilotDocument as any).mockResolvedValueOnce(copilotErr)

    const result = await runCopilotChatJob(mockJob)
    expect(result).toBe(copilotErr)
    expect(chatService.runNewCopilotChat).not.toHaveBeenCalled()
    expect(chatService.addMessageToExistingCopilotChat).not.toHaveBeenCalled()
  })

  it('creates a new chat when no document log exists', async () => {
    // ensure findByUuid returns ok: false
    ;(DocumentLogsRepository.prototype.findByUuid as any).mockResolvedValueOnce(
      { ok: false },
    )

    await runCopilotChatJob(mockJob)

    expect(chatService.runNewCopilotChat).toHaveBeenCalledWith({
      copilotWorkspace: { id: 99 },
      copilotCommit: { id: 98 },
      copilotDocument: { uuid: 'doc-123' },
      clientWorkspace: workspace,
      context: {
        path: '/some/path',
      },
      chatUuid,
      message: messageText,
    })
    expect(chatService.addMessageToExistingCopilotChat).not.toHaveBeenCalled()
  })

  it('appends a message when the document log already exists', async () => {
    ;(DocumentLogsRepository.prototype.findByUuid as any).mockResolvedValueOnce(
      { ok: true },
    )

    await runCopilotChatJob(mockJob)

    expect(chatService.addMessageToExistingCopilotChat).toHaveBeenCalledWith({
      copilotWorkspace: { id: 99 },
      copilotCommit: { id: 98 },
      copilotDocument: { uuid: 'doc-123' },
      clientWorkspace: workspace,
      chatUuid,
      message: messageText,
      context: {
        path: '/some/path',
      },
    })
    expect(chatService.runNewCopilotChat).not.toHaveBeenCalled()
  })
})
