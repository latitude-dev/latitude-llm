import { beforeAll, describe, expect, it, vi } from 'vitest'

import { mockToolRequestsCopilot } from '../../../../tests/helpers'
import * as factories from '../../../../tests/factories'
import { LogSources, Providers } from '@latitude-data/constants'
import * as runDocUntilStops from './runDocumentUntilItStops'
import {
  Commit,
  DocumentVersion,
  Project,
  Workspace,
} from '../../../../browser'
import * as runDoc from '../../../../services/commits/runDocumentAtCommit'
import { NotFoundError, Result } from '../../../../lib'
import { AutogenerateToolResponseCopilotData } from './getCopilotData'
import type { RunDocumentAtCommitWithAutoToolResponsesFn } from './index'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { ChainError } from '../../../../lib/streamManager/ChainErrors'

let workspace: Workspace
let project: Project
let commit: Commit
let document: DocumentVersion
let copilot: AutogenerateToolResponseCopilotData
let runDocumentAtCommitWithAutoToolResponses: RunDocumentAtCommitWithAutoToolResponsesFn

describe('runDocumentAtCommitWithAutoToolResponses', () => {
  beforeAll(async () => {
    copilot = await mockToolRequestsCopilot()
    const setup = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'Latitude' }],
      documents: {
        'test-doc': factories.helpers.createPrompt({ provider: 'Latitude' }),
      },
    })
    workspace = setup.workspace
    project = setup.project
    document = setup.documents[0]!
    commit = setup.commit

    const mod = await import('./index')
    runDocumentAtCommitWithAutoToolResponses =
      mod.runDocumentAtCommitWithAutoToolResponses
  })

  it('it runs document without tools', async () => {
    const mockResult = {
      response: Promise.resolve(Result.ok({ providerLog: { uuid: 'log1' } })),
      errorableUuid: 'log1',
    }
    vi.spyOn(runDoc, 'runDocumentAtCommit')
    const mockRunUntilItStops = vi.spyOn(
      runDocUntilStops,
      'runDocumentUntilItStops',
    )
    vi.mocked(runDoc.runDocumentAtCommit).mockResolvedValue(
      // @ts-ignore
      Result.ok(mockResult),
    )

    await runDocumentAtCommitWithAutoToolResponses({
      workspaceId: workspace.id,
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
      parameters: { param1: 'value1' },
      source: LogSources.Playground,
    })

    expect(runDoc.runDocumentAtCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace,
        commit,
        parameters: { param1: 'value1' },
        source: LogSources.Playground,
      }),
    )

    expect(runDocUntilStops.runDocumentUntilItStops).toHaveBeenCalledWith(
      {
        hasToolCalls: false,
        data: {
          workspace,
          commit,
          document,
          parameters: { param1: 'value1' },
          source: LogSources.Playground,
          copilot,
        },
      },
      mockRunUntilItStops,
    )
  })

  it('returns error when data not found', async () => {
    const randomFakeCommituuid = '19b1b3b1-1b3b-1b3b-1b3b-1b3b1b3b1b3b'
    const result = await runDocumentAtCommitWithAutoToolResponses({
      workspaceId: workspace.id,
      projectId: project.id,
      commitUuid: randomFakeCommituuid,
      documentUuid: document.documentUuid,
      parameters: { param1: 'value1' },
      source: LogSources.Playground,
    })

    expect(result.error).toEqual(
      new NotFoundError(`Commit with uuid ${randomFakeCommituuid} not found`),
    )
  })

  // Invalid prompt for example
  it('returns error when something fails in runDocumentAtCommit', async () => {
    const mockResult = Result.error(
      new ChainError({
        code: RunErrorCodes.ChainCompileError,
        message: 'Some chain error',
      }),
    )

    vi.spyOn(runDoc, 'runDocumentAtCommit')
    vi.mocked(runDoc.runDocumentAtCommit).mockResolvedValue(mockResult)

    const mod = await import('./index')
    runDocumentAtCommitWithAutoToolResponses =
      mod.runDocumentAtCommitWithAutoToolResponses

    const result = await runDocumentAtCommitWithAutoToolResponses({
      workspaceId: workspace.id,
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
      parameters: { param1: 'value1' },
      source: LogSources.Playground,
    })

    expect(result).toEqual(mockResult)
  })

  it('runs document with tools', async () => {
    const fakeTools = [
      {
        id: 'call_fak3123',
        name: 'get_weather',
        arguments: { city: 'New York' },
      },
    ]
    const mockResult = {
      response: Promise.resolve(
        Result.ok({
          providerLog: { uuid: 'log1' },
          toolCalls: fakeTools,
        }),
      ),
      errorableUuid: 'log1',
    }

    vi.spyOn(runDoc, 'runDocumentAtCommit')
    vi.mocked(runDoc.runDocumentAtCommit).mockResolvedValueOnce(
      // @ts-ignore
      Result.ok(mockResult),
    )
    vi.spyOn(runDocUntilStops, 'runDocumentUntilItStops')

    const mod = await import('./index')
    runDocumentAtCommitWithAutoToolResponses =
      mod.runDocumentAtCommitWithAutoToolResponses

    await runDocumentAtCommitWithAutoToolResponses({
      workspaceId: workspace.id,
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
      parameters: { param1: 'value1' },
      source: LogSources.Playground,
    })

    expect(runDoc.runDocumentAtCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace,
        commit,
        parameters: { param1: 'value1' },
        source: LogSources.Playground,
      }),
    )

    expect(runDocUntilStops.runDocumentUntilItStops).toHaveBeenNthCalledWith(
      1,
      {
        hasToolCalls: false,
        data: {
          workspace,
          commit,
          document,
          copilot,
          source: LogSources.Playground,
          parameters: { param1: 'value1' },
        },
      },
      runDocUntilStops.runDocumentUntilItStops,
    )

    expect(runDocUntilStops.runDocumentUntilItStops).toHaveBeenNthCalledWith(
      2,
      {
        hasToolCalls: true,
        data: {
          workspace,
          commit,
          document,
          source: LogSources.Playground,
          copilot,
          documentLogUuid: 'log1',
          toolCalls: fakeTools,
        },
      },
      runDocUntilStops.runDocumentUntilItStops,
    )
  })
})
