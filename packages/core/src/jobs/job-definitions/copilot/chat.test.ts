import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as dataAccess from '../../../data-access/workspaces'
import * as findProjectByIdModule from '../../../queries/projects/findById'
import { unsafelyFindSpanByDocumentLogUuid } from '../../../queries/spans/findByDocumentLogUuid'
import * as findWorkspaceUserByIdModule from '../../../queries/users/findInWorkspace'
import * as addMessageLatte from '../../../services/copilot/latte/addMessage'
import * as chatHelpers from '../../../services/copilot/latte/helpers'
import { WebsocketClient } from '../../../websockets/workers'
import { runLatteJob } from './chat'
import { type Project } from '../../../schema/models/types/Project'

vi.mock('../../../queries/spans/findByDocumentLogUuid', () => ({
  unsafelyFindSpanByDocumentLogUuid: vi.fn(),
}))

describe('runLatteJob', () => {
  let mockJob: Job<any>
  const workspace = { id: 1 }
  const user = { id: 'user-123' }
  const project = { id: 2 } as Project
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
        abortSignal: new AbortController().signal,
      },
    } as Job<any>

    // default happy-path spies
    vi.spyOn(dataAccess, 'unsafelyFindWorkspace').mockResolvedValue(
      workspace as any,
    )
    vi.spyOn(findProjectByIdModule, 'findProjectById').mockResolvedValue(
      project as any,
    )
    vi.spyOn(
      findWorkspaceUserByIdModule,
      'findWorkspaceUserById',
    ).mockResolvedValue({
      ok: true,
      error: undefined,
      value: user,
      unwrap: () => user,
    } as any)
    vi.spyOn(chatHelpers, 'getCopilotDocument').mockResolvedValue({
      ok: true,
      unwrap: () => ({
        workspace: { id: 99 },
        commit: { id: 98 },
        document: { uuid: 'doc-123' },
      }),
    } as any)
    vi.mocked(unsafelyFindSpanByDocumentLogUuid).mockResolvedValue(undefined)
    vi.spyOn(WebsocketClient, 'sendEvent').mockResolvedValue({
      emit: vi.fn(),
    } as any)
    vi.spyOn(addMessageLatte, 'runNewLatte').mockResolvedValue({
      ok: true,
      unwrap: vi.fn(),
    } as any)
    vi.spyOn(addMessageLatte, 'addMessageToExistingLatte').mockResolvedValue({
      ok: true,
      unwrap: vi.fn(),
    } as any)
  })

  it('returns the copilotResult if getCopilotDocument fails', async () => {
    const copilotErr = { ok: false, error: new Error('copilot fail') }
    ;(chatHelpers.getCopilotDocument as any).mockResolvedValueOnce(copilotErr)

    const result = await runLatteJob(mockJob)
    expect(result).toBe(copilotErr)
    expect(addMessageLatte.runNewLatte).not.toHaveBeenCalled()
    expect(addMessageLatte.addMessageToExistingLatte).not.toHaveBeenCalled()
  })

  it('returns the userResult if user lookup fails', async () => {
    const userErr = {
      ok: false,
      error: new Error('user not found'),
      value: undefined,
      unwrap: () => {
        throw new Error('user not found')
      },
    }
    ;(
      findWorkspaceUserByIdModule.findWorkspaceUserById as any
    ).mockResolvedValueOnce(userErr)

    const result = await runLatteJob(mockJob)
    expect(result).toBe(userErr)
    expect(addMessageLatte.runNewLatte).not.toHaveBeenCalled()
    expect(addMessageLatte.addMessageToExistingLatte).not.toHaveBeenCalled()
  })

  it('creates a new chat when no span exists', async () => {
    vi.mocked(unsafelyFindSpanByDocumentLogUuid).mockResolvedValueOnce(
      undefined,
    )

    await runLatteJob(mockJob)

    expect(addMessageLatte.runNewLatte).toHaveBeenCalledWith({
      copilotWorkspace: { id: 99 },
      copilotCommit: { id: 98 },
      copilotDocument: { uuid: 'doc-123' },
      clientWorkspace: workspace,
      clientProject: project,
      user,
      context: {
        path: '/some/path',
      },
      threadUuid,
      message: messageText,
      abortSignal: expect.any(AbortSignal),
    })
    expect(addMessageLatte.addMessageToExistingLatte).not.toHaveBeenCalled()
  })

  it('appends a message when a span already exists', async () => {
    vi.mocked(unsafelyFindSpanByDocumentLogUuid).mockResolvedValueOnce({
      id: 'span-123',
      traceId: 'trace-123',
    } as any)
    await runLatteJob(mockJob)

    expect(addMessageLatte.addMessageToExistingLatte).toHaveBeenCalledWith({
      copilotWorkspace: { id: 99 },
      copilotCommit: { id: 98 },
      copilotDocument: { uuid: 'doc-123' },
      clientWorkspace: workspace,
      clientProject: project,
      user,
      threadUuid,
      message: messageText,
      context: {
        path: '/some/path',
      },
      abortSignal: expect.any(AbortSignal),
    })
    expect(addMessageLatte.runNewLatte).not.toHaveBeenCalled()
  })
})
