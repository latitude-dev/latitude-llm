import { beforeEach, describe, expect, it } from 'vitest'

import { Commit, DocumentVersion, Project, ProviderApiKey } from '../../browser'
import { Providers } from '../../constants'
import * as factories from '../../tests/factories'
import { computeProjectStats } from './computeProjectStats'

describe('computeProjectStats', () => {
  let project: Project
  let workspace: any
  let document: DocumentVersion
  let commit: Commit
  let provider: ProviderApiKey

  beforeEach(async () => {
    const setup = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        'doc1.md': factories.helpers.createPrompt({
          provider: 'openai',
        }),
      },
    })
    provider = setup.providers[0]!
    project = setup.project
    workspace = setup.workspace
    document = setup.documents[0]!
    commit = setup.commit
  })

  it('returns zero stats for empty project', async () => {
    const result = await computeProjectStats({ project })
    expect(result.ok).toBe(true)

    const stats = result.unwrap()
    expect(stats).toMatchObject({
      totalTokens: 0,
      totalRuns: 0,
      totalDocuments: 1,
      runsPerModel: {},
      costPerModel: {},
      rollingDocumentLogs: [],
      totalEvaluations: 0,
      totalEvaluationRuns: 0,
      evaluationCosts: [],
    })
  })

  it('computes correct stats for project with runs', async () => {
    // Create document log with provider log
    const { documentLog } = await factories.createDocumentLog({
      document,
      commit,
      skipProviderLogs: true,
    })

    const pl = await factories.createProviderLog({
      workspace,
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: provider.provider,
      model: 'gpt-4',
      tokens: 100,
      costInMillicents: 500,
    })

    const result = await computeProjectStats({ project })
    expect(result.ok).toBe(true)

    const stats = result.unwrap()
    expect(stats).toMatchObject({
      totalTokens: pl.tokens,
      totalRuns: 1,
      totalDocuments: 1,
      runsPerModel: {
        'gpt-4': 1,
      },
      costPerModel: {
        'gpt-4': 500,
      },
    })
    expect(stats.rollingDocumentLogs).toHaveLength(1)
  })
})
