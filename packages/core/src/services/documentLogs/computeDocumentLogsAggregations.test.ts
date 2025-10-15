import { RunErrorCodes } from '@latitude-data/constants/errors'
import { beforeEach, describe, expect, it } from 'vitest'

import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { type User } from '../../schema/models/types/User'
import { Providers } from '@latitude-data/constants'
import * as factories from '../../tests/factories'
import { computeDocumentLogsAggregations } from './computeDocumentLogsAggregations'
import { ErrorableEntity, LOG_SOURCES } from '../../constants'

describe('computeDocumentLogsAggregations', () => {
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
  })

  it('computes correct aggregations for document logs', async () => {
    await factories.createDocumentLog({
      document,
      commit,
    })
    await factories.createDocumentLog({
      document,
      commit,
    })

    const result = await computeDocumentLogsAggregations({
      projectId: project.id,
      documentUuid: document.documentUuid,
    }).then((r) => r.unwrap())

    expect(result.totalCount).toBe(2)
    expect(result.totalTokens).toBeGreaterThan(0)
    expect(result.totalCostInMillicents).toBeGreaterThan(0)
    expect(result.averageTokens).toBeGreaterThan(0)
    expect(result.averageCostInMillicents).toBeGreaterThan(0)
    expect(result.medianCostInMillicents).toBeGreaterThan(0)
    expect(result.averageDuration).toBeGreaterThan(0)
    expect(result.medianDuration).toBeGreaterThan(0)
  })

  it('only includes logs from specified draft', async () => {
    const { commit: otherCommit } = await factories.createDraft({
      project,
      user,
    })

    // Create logs for main commit
    await factories.createDocumentLog({ document, commit })

    // Create logs for other commit
    await factories.createDocumentLog({ document, commit: otherCommit })

    const result = await computeDocumentLogsAggregations({
      projectId: project.id,
      documentUuid: document.documentUuid,
      filterOptions: {
        commitIds: [commit.id],
        logSources: LOG_SOURCES,
        createdAt: undefined,
        customIdentifier: undefined,
        experimentId: undefined,
      },
    }).then((r) => r.unwrap())

    expect(result.totalCount).toBe(1)
  })

  it('only includes logs from specified custom identifier', async () => {
    const { commit: draft } = await factories.createDraft({
      project,
      user,
    })

    // Create log with custom identifier
    await factories.createDocumentLog({
      document,
      commit: draft,
      customIdentifier: '31',
    })

    // Create other logs
    await factories.createDocumentLog({ document, commit })
    await factories.createDocumentLog({
      document,
      commit: draft,
      customIdentifier: '32',
    })
    await factories.createDocumentLog({ document, commit: draft })

    const result = await computeDocumentLogsAggregations({
      projectId: project.id,
      documentUuid: document.documentUuid,
      filterOptions: {
        commitIds: [draft.id],
        logSources: LOG_SOURCES,
        createdAt: undefined,
        customIdentifier: '31',
        experimentId: undefined,
      },
    }).then((r) => r.unwrap())

    expect(result.totalCount).toBe(1)
  })

  it('includes logs with errors in the total count', async () => {
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

    const result = await computeDocumentLogsAggregations({
      projectId: project.id,
      documentUuid: document.documentUuid,
    }).then((r) => r.unwrap())

    expect(result.totalCount).toBe(2)
  })

  it('returns zero values when no logs exist', async () => {
    const result = await computeDocumentLogsAggregations({
      projectId: project.id,
      documentUuid: document.documentUuid,
    }).then((r) => r.unwrap())

    expect(result).toEqual({
      totalCount: 0,
      totalTokens: 0,
      totalCostInMillicents: 0,
      averageTokens: 0,
      averageCostInMillicents: 0,
      medianCostInMillicents: 0,
      averageDuration: 0,
      medianDuration: 0,
    })
  })

  it('handles logs without provider logs', async () => {
    await factories.createDocumentLog({
      document,
      commit,
      skipProviderLogs: true,
    })

    const result = await computeDocumentLogsAggregations({
      projectId: project.id,
      documentUuid: document.documentUuid,
    }).then((r) => r.unwrap())

    expect(result.totalCount).toBe(1)
    expect(result.totalTokens).toBe(0)
    expect(result.totalCostInMillicents).toBe(0)
  })
})
