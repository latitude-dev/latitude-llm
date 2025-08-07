import * as factories from '@latitude-data/core/factories'
import { Providers } from '@latitude-data/constants'
import { describe, expect, beforeEach, it, vi } from 'vitest'
import type { Workspace } from '../../../../../../browser'
import { Result } from '../../../../../../lib/Result'
import triggerActions from './triggerActions'
import type { LatteToolContext } from '../../types'
import { CommitsRepository } from '../../../../../../repositories'
import { BadRequestError } from '@latitude-data/constants/errors'

const mockCommit = (mergedAt: boolean) => ({
  projectId: 1,
  uuid: 'commit-uuid',
  mergedAt,
})

describe('triggerActions', () => {
  let workspace: Workspace

  beforeEach(async () => {
    const project = await factories.createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai',
        },
      ],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Doc 1 commit 1',
        }),
      },
    })
    workspace = project.workspace
    vi.restoreAllMocks()
  })

  it('Returns error if commit is not found', async () => {
    vi.spyOn(
      CommitsRepository.prototype,
      'getCommitByUuid',
      // @ts-expect-error: mocking
    ).mockImplementationOnce(() => {
      return Promise.resolve({
        unwrap: () => mockCommit(true),
        ok: false,
      })
    })

    const params = {
      projectId: 1,
      versionUuid: 'commit-uuid',
      promptUuid: '1111-1111-1111-1111',
      actions: [],
    }
    const result = await triggerActions(params, {
      workspace: workspace,
    } as LatteToolContext)

    expect(result.ok).toBe(false)
  })

  it('returns result error when commit is not merged', async () => {
    const expectedError = new BadRequestError(
      `Cannot modify/add/delete triggers on a draft commit. Select a previous live commit or publish the draft.`,
    )
    const expectedResultError = Result.error(expectedError)

    vi.spyOn(
      CommitsRepository.prototype,
      'getCommitByUuid',
      // @ts-expect-error: mocking
    ).mockImplementationOnce(() => {
      return Promise.resolve({
        unwrap: () => expectedResultError,
        ok: true,
      })
    })

    const params = {
      projectId: 1,
      versionUuid: 'commit-uuid',
      promptUuid: '1111-1111-1111-1111',
      actions: [],
    }
    const result = await triggerActions(params, {
      workspace: workspace,
    } as LatteToolContext)

    expect(result.ok).toBe(false)
    expect(result.error).toEqual(expectedError)
  })
})
