import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as dataAccess from '../../../data-access'
import {
  CommitsRepository,
  DocumentLogsRepository,
  UsersRepository,
} from '../../../repositories'
import * as runLatte from '../../../services/copilot/latte/run'
import * as addMessageLatte from '../../../services/copilot/latte/addMessage'
import * as chatHelpers from '../../../services/copilot/latte/helpers'
import { WebsocketClient } from '../../../websockets/workers'
import { runLatteJob } from './chat'

describe('runLatteJob', () => {
  let mockJob: Job<any>
  const workspace = { id: 1 }
  const user = { id: 'user-123' }
  const project = { id: 2 }
  const commit = { id: 3 }
  const threadUuid = 'chat-uuid'
  const messageText = 'Hello, Copilot!'

  beforeEach(() => {
    vi.clearAllMocks()

    mockJob = {
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        projectId: project.id,
        commitId: commit.id,
        threadUuid,
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
    vi.spyOn(UsersRepository.prototype, 'find').mockResolvedValue({
      ok: true,
      unwrap: () => user,
    } as any)
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
    vi.spyOn(runLatte, 'runNewLatte').mockResolvedValue({
      ok: true,
      unwrap: vi.fn(),
    } as any)
    vi.spyOn(addMessageLatte, 'addMessageToExistingLatte').mockResolvedValue({
      ok: true,
      unwrap: vi.fn(),
    } as any)
  })

  it('returns the copilotResult if getCopilotDocument fails', async () => {
    const commitOk = { ok: true, unwrap: () => commit }
    ;(CommitsRepository.prototype.find as any).mockResolvedValueOnce(commitOk)
    const copilotErr = { ok: false, error: new Error('copilot fail') }
    ;(chatHelpers.getCopilotDocument as any).mockResolvedValueOnce(copilotErr)

    const result = await runLatteJob(mockJob)
    expect(result).toBe(copilotErr)
    expect(runLatte.runNewLatte).not.toHaveBeenCalled()
    expect(addMessageLatte.addMessageToExistingLatte).not.toHaveBeenCalled()
  })

  it('returns the userResult if user lookup fails', async () => {
    const userErr = { ok: false, error: new Error('user not found') }
    ;(UsersRepository.prototype.find as any).mockResolvedValueOnce(userErr)

    const result = await runLatteJob(mockJob)
    expect(result).toBe(userErr)
    expect(runLatte.runNewLatte).not.toHaveBeenCalled()
    expect(addMessageLatte.addMessageToExistingLatte).not.toHaveBeenCalled()
  })

  it('creates a new chat when no document log exists', async () => {
    // ensure findByUuid returns ok: false
    ;(DocumentLogsRepository.prototype.findByUuid as any).mockResolvedValueOnce(
      { ok: false },
    )

    await runLatteJob(mockJob)

    expect(runLatte.runNewLatte).toHaveBeenCalledWith({
      copilotWorkspace: { id: 99 },
      copilotCommit: { id: 98 },
      copilotDocument: { uuid: 'doc-123' },
      clientWorkspace: workspace,
      user,
      context: {
        path: '/some/path',
      },
      threadUuid,
      message: messageText,
    })
    expect(addMessageLatte.addMessageToExistingLatte).not.toHaveBeenCalled()
  })

  it('appends a message when the document log already exists', async () => {
    ;(DocumentLogsRepository.prototype.findByUuid as any).mockResolvedValueOnce(
      { ok: true },
    )

    await runLatteJob(mockJob)

    expect(addMessageLatte.addMessageToExistingLatte).toHaveBeenCalledWith({
      copilotWorkspace: { id: 99 },
      copilotCommit: { id: 98 },
      copilotDocument: { uuid: 'doc-123' },
      clientWorkspace: workspace,
      user,
      threadUuid,
      message: messageText,
      context: {
        path: '/some/path',
      },
    })
    expect(runLatte.runNewLatte).not.toHaveBeenCalled()
  })
})
