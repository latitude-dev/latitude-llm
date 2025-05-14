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
import { MessageRole, ContentType } from '@latitude-data/compiler'

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
    vi.spyOn(WebsocketClient, 'getSocket').mockResolvedValue({
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

  it('returns the commitResult if the commit is not found', async () => {
    const errorResult = { ok: false, error: new Error('not found') }
    ;(CommitsRepository.prototype.find as any).mockResolvedValueOnce(
      errorResult,
    )

    const result = await runCopilotChatJob(mockJob)
    expect(result).toBe(errorResult)
    expect(chatHelpers.getCopilotDocument).not.toHaveBeenCalled()
    expect(chatService.runNewCopilotChat).not.toHaveBeenCalled()
    expect(chatService.addMessageToExistingCopilotChat).not.toHaveBeenCalled()
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
    const socket = await WebsocketClient.getSocket()
    // ensure findByUuid returns ok: false
    ;(DocumentLogsRepository.prototype.findByUuid as any).mockResolvedValueOnce(
      { ok: false },
    )

    await runCopilotChatJob(mockJob)

    expect(chatService.runNewCopilotChat).toHaveBeenCalledWith({
      websockets: socket,
      copilotWorkspace: { id: 99 },
      copilotCommit: { id: 98 },
      copilotDocument: { uuid: 'doc-123' },
      clientWorkspace: workspace,
      clientProject: project,
      clientCommit: commit,
      chatUuid,
      message: messageText,
    })
    expect(chatService.addMessageToExistingCopilotChat).not.toHaveBeenCalled()
  })

  it('appends a message when the document log already exists', async () => {
    const socket = await WebsocketClient.getSocket()
    ;(DocumentLogsRepository.prototype.findByUuid as any).mockResolvedValueOnce(
      { ok: true },
    )

    await runCopilotChatJob(mockJob)

    expect(chatService.addMessageToExistingCopilotChat).toHaveBeenCalledWith({
      websockets: socket,
      copilotWorkspace: { id: 99 },
      copilotCommit: { id: 98 },
      copilotDocument: { uuid: 'doc-123' },
      clientWorkspace: workspace,
      clientProject: project,
      clientCommit: commit,
      chatUuid,
      messages: [
        {
          role: MessageRole.user,
          content: [
            {
              type: ContentType.text,
              text: messageText,
            },
          ],
        },
      ],
    })
    expect(chatService.runNewCopilotChat).not.toHaveBeenCalled()
  })
})
