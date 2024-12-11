import { RunErrorCodes } from '@latitude-data/constants/errors'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  Commit,
  DocumentVersion,
  ErrorableEntity,
  LOG_SOURCES,
  Project,
  Providers,
  User,
  Workspace,
} from '../../browser'
import * as factories from '../../tests/factories'
import { computeDocumentLogsDailyCount } from './computeDocumentLogsDailyCount'

describe('computeDocumentLogsDailyCount', () => {
  let workspace: Workspace
  let user: User
  let project: Project
  let document: DocumentVersion
  let commit: Commit

  beforeEach(async () => {
    const setup = await factories.createProject({
      providers: [
        {
          name: 'openai',
          type: Providers.OpenAI,
        },
      ],
      documents: {
        foo: factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      },
    })
    user = setup.user
    project = setup.project
    commit = setup.commit
    document = setup.documents[0]!
    workspace = setup.workspace
  })

  it('returns daily counts for document logs', async () => {
    // Create logs across different days
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const twoDaysAgo = new Date(today)
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

    // Create 2 logs for today
    await Promise.all([
      factories.createDocumentLog({
        document,
        commit,
        createdAt: today,
      }),
      factories.createDocumentLog({
        document,
        commit,
        createdAt: today,
      }),
    ])

    // Create 1 log for yesterday
    await factories.createDocumentLog({
      document,
      commit,
      createdAt: yesterday,
    })

    // Create 3 logs for two days ago
    await Promise.all([
      factories.createDocumentLog({
        document,
        commit,
        createdAt: twoDaysAgo,
      }),
      factories.createDocumentLog({
        document,
        commit,
        createdAt: twoDaysAgo,
      }),
      factories.createDocumentLog({
        document,
        commit,
        createdAt: twoDaysAgo,
      }),
    ])

    const result = await computeDocumentLogsDailyCount({
      workspace,
      documentUuid: document.documentUuid,
      filterOptions: {
        commitIds: [commit.id],
        logSources: LOG_SOURCES,
        createdAt: undefined,
      },
      days: 3,
    })

    expect(result).toHaveLength(3)
    expect(
      result.find((r) => r.date === twoDaysAgo.toISOString().split('T')[0])
        ?.count,
    ).toBe(3)
    expect(
      result.find((r) => r.date === yesterday.toISOString().split('T')[0])
        ?.count,
    ).toBe(1)
    expect(
      result.find((r) => r.date === today.toISOString().split('T')[0])?.count,
    ).toBe(2)
  })

  it('only includes logs from specified draft', async () => {
    const { commit: otherCommit } = await factories.createDraft({
      project,
      user,
    })

    // Create logs for main commit
    await Promise.all([
      factories.createDocumentLog({ document, commit }),
      factories.createDocumentLog({ document, commit }),
    ])

    // Create logs for other commit
    await Promise.all([
      factories.createDocumentLog({ document, commit: otherCommit }),
      factories.createDocumentLog({ document, commit: otherCommit }),
    ])

    const result = await computeDocumentLogsDailyCount({
      workspace,
      documentUuid: document.documentUuid,
      filterOptions: {
        commitIds: [commit.id],
        logSources: LOG_SOURCES,
        createdAt: undefined,
      },
    })

    expect(result[0]?.count).toBe(2)
  })

  it('excludes logs with errors', async () => {
    const { documentLog } = await factories.createDocumentLog({
      document,
      commit,
    })
    await factories.createRunError({
      errorableType: ErrorableEntity.DocumentLog,
      errorableUuid: documentLog.uuid,
      code: RunErrorCodes.Unknown,
      message: 'Test error',
    })

    // Create another valid log
    await factories.createDocumentLog({ document, commit })

    const result = await computeDocumentLogsDailyCount({
      workspace,
      documentUuid: document.documentUuid,
      filterOptions: {
        commitIds: [commit.id],
        logSources: LOG_SOURCES,
        createdAt: undefined,
      },
    })

    expect(result[0]?.count).toBe(1)
  })

  it('respects the days parameter', async () => {
    const today = new Date()
    const oldDate = new Date(today)
    oldDate.setDate(oldDate.getDate() - 31) // 31 days ago

    await factories.createDocumentLog({
      document,
      commit,
      createdAt: oldDate,
    })
    await factories.createDocumentLog({
      document,
      commit,
      createdAt: today,
    })

    const result = await computeDocumentLogsDailyCount({
      workspace,
      documentUuid: document.documentUuid,
      filterOptions: {
        commitIds: [commit.id],
        logSources: LOG_SOURCES,
        createdAt: undefined,
      },
      days: 30,
    })

    // Should only include today's log
    expect(result).toHaveLength(1)
    expect(result[0]?.count).toBe(1)
  })
})
