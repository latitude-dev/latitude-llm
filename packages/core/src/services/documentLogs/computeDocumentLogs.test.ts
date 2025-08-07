import { beforeEach, describe, expect, it } from 'vitest'

import {
  type Commit,
  type DocumentVersion,
  ErrorableEntity,
  LogSources,
  Providers,
} from '../../browser'
import * as factories from '../../tests/factories'
import { computeDocumentLogs, computeDocumentLogsCount } from './computeDocumentLogs'
import { RunErrorCodes } from '@latitude-data/constants/errors'

describe('computeDocumentLogs', () => {
  let doc: DocumentVersion
  let commit: Commit

  beforeEach(async () => {
    const setup = await factories.createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai',
        },
      ],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
        }),
      },
    })
    doc = setup.documents[0]!
    commit = setup.commit
  })

  it('returns document logs for a given document', async () => {
    const { documentLog: log1 } = await factories.createDocumentLog({
      document: doc,
      commit,
    })
    const { documentLog: log2 } = await factories.createDocumentLog({
      document: doc,
      commit,
    })

    const result = await computeDocumentLogs({
      document: doc,
    })

    expect(result).toHaveLength(2)
    expect(result.map((log) => log.uuid)).toEqual(expect.arrayContaining([log1.uuid, log2.uuid]))
  })

  it('paginates results correctly', async () => {
    await factories.createDocumentLog({ document: doc, commit })
    await factories.createDocumentLog({ document: doc, commit })
    await factories.createDocumentLog({ document: doc, commit })

    const result = await computeDocumentLogs({
      document: doc,
      page: '2',
      pageSize: '2',
    })

    expect(result).toHaveLength(1)
  })

  it('filters by custom identifier', async () => {
    const { documentLog: log1 } = await factories.createDocumentLog({
      document: doc,
      commit,
      customIdentifier: 'test-123',
    })
    await factories.createDocumentLog({
      document: doc,
      commit,
      customIdentifier: 'other-456',
    })

    const result = await computeDocumentLogs({
      document: doc,
      filterOptions: {
        createdAt: { from: log1.createdAt },
        experimentId: undefined,
        logSources: [LogSources.API],
        commitIds: [commit.id],
        customIdentifier: 'test-123',
      },
    })

    expect(result).toHaveLength(1)
    expect(result[0]!.uuid).toBe(log1.uuid)
  })

  it('orders by created date in descending order', async () => {
    const { documentLog: log1 } = await factories.createDocumentLog({
      document: doc,
      commit,
    })
    const { documentLog: log2 } = await factories.createDocumentLog({
      document: doc,
      commit,
    })

    const result = await computeDocumentLogs({
      document: doc,
    })

    expect(result).toHaveLength(2)
    expect(result[0]!.uuid).toBe(log2.uuid)
    expect(result[1]!.uuid).toBe(log1.uuid)
  })

  it('excludes logs with errors', async () => {
    const { documentLog: log1 } = await factories.createDocumentLog({
      document: doc,
      commit,
    })
    const { documentLog: log2 } = await factories.createDocumentLog({
      document: doc,
      commit,
    })
    await factories.createRunError({
      code: RunErrorCodes.Unknown,
      message: 'test error',
      errorableType: ErrorableEntity.DocumentLog,
      errorableUuid: log2.uuid,
    })

    const result = await computeDocumentLogs({
      document: doc,
    })

    expect(result).toHaveLength(1)
    expect(result[0]!.uuid).toBe(log1.uuid)
  })
})

describe('computeDocumentLogsCount', () => {
  let doc: DocumentVersion
  let commit: Commit

  beforeEach(async () => {
    const setup = await factories.createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai',
        },
      ],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
        }),
      },
    })
    doc = setup.documents[0]!
    commit = setup.commit
  })

  it('returns correct count of document logs', async () => {
    await factories.createDocumentLog({ document: doc, commit })
    await factories.createDocumentLog({ document: doc, commit })
    await factories.createDocumentLog({ document: doc, commit })

    const count = await computeDocumentLogsCount({
      document: doc,
    })

    expect(count).toBe(3)
  })

  it('excludes logs with errors from count', async () => {
    await factories.createDocumentLog({ document: doc, commit })
    const { documentLog: erroredLog } = await factories.createDocumentLog({
      document: doc,
      commit,
    })
    await factories.createDocumentLog({ document: doc, commit })

    await factories.createRunError({
      code: RunErrorCodes.Unknown,
      message: 'test error',
      errorableType: ErrorableEntity.DocumentLog,
      errorableUuid: erroredLog.uuid,
    })

    const count = await computeDocumentLogsCount({
      document: doc,
    })

    expect(count).toBe(2)
  })

  it('filters count by custom identifier', async () => {
    const { documentLog: log1 } = await factories.createDocumentLog({
      document: doc,
      commit,
      customIdentifier: 'test-123',
    })
    await factories.createDocumentLog({
      document: doc,
      commit,
      customIdentifier: 'other-456',
    })

    const count = await computeDocumentLogsCount({
      document: doc,
      filterOptions: {
        createdAt: { from: log1.createdAt },
        experimentId: undefined,
        logSources: [LogSources.API],
        commitIds: [commit.id],
        customIdentifier: 'test-123',
      },
    })

    expect(count).toBe(1)
  })
})
