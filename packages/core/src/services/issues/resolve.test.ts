import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { Providers } from '@latitude-data/constants'
import { database } from '../../client'
import { EvaluationType, LlmEvaluationMetric } from '../../constants'
import { createEvaluationV2 } from '../../tests/factories/evaluationsV2'
import { createIssue } from '../../tests/factories/issues'
import { createProject } from '../../tests/factories/projects'
import { createProviderApiKey } from '../../tests/factories/providerApiKeys'
import { createUser } from '../../tests/factories/users'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { issues } from '../../schema/models/issues'
import { resolveIssue } from './resolve'
import * as publisherModule from '../../events/publisher'

vi.mock('../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

describe('resolveIssue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves an active issue', async () => {
    const { workspace, project, documents } = await createProject({
      documents: { 'test-doc': 'Hello world' },
    })
    const document = documents[0]!
    const user = await createUser()

    const { issue } = await createIssue({
      workspace,
      project,
      document,
      createdAt: new Date(),
    })

    const result = await resolveIssue({ issue, user, ignoreEvaluations: false })

    expect(result.ok).toBe(true)
    const resolvedIssue = result.unwrap().issue
    expect(resolvedIssue.resolvedAt).not.toBeNull()
  })

  it('fails when issue is already ignored', async () => {
    const { workspace, project, documents } = await createProject({
      documents: { 'test-doc': 'Hello world' },
    })
    const document = documents[0]!
    const user = await createUser()

    const { issue } = await createIssue({
      workspace,
      project,
      document,
      createdAt: new Date(),
    })

    // Manually set ignoredAt
    const [ignoredIssue] = await database
      .update(issues)
      .set({ ignoredAt: new Date() })
      .where(eq(issues.id, issue.id))
      .returning()

    const result = await resolveIssue({
      issue: ignoredIssue!,
      user,
      ignoreEvaluations: false,
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toContain('Cannot resolve an ignored issue')
  })

  it('fails when issue is already resolved', async () => {
    const { workspace, project, documents } = await createProject({
      documents: { 'test-doc': 'Hello world' },
    })
    const document = documents[0]!
    const user = await createUser()

    const { issue } = await createIssue({
      workspace,
      project,
      document,
      createdAt: new Date(),
    })

    // Resolve first
    const firstResult = await resolveIssue({
      issue,
      user,
      ignoreEvaluations: false,
    })
    const resolvedIssue = firstResult.unwrap().issue

    // Try to resolve again
    const result = await resolveIssue({
      issue: resolvedIssue,
      user,
      ignoreEvaluations: false,
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toContain('Issue is already resolved')
  })

  it('publishes issueResolved event', async () => {
    const { workspace, project, documents } = await createProject({
      documents: { 'test-doc': 'Hello world' },
    })
    const document = documents[0]!
    const user = await createUser()

    const { issue } = await createIssue({
      workspace,
      project,
      document,
      createdAt: new Date(),
    })

    await resolveIssue({ issue, user, ignoreEvaluations: false })

    expect(publisherModule.publisher.publishLater).toHaveBeenCalledWith({
      type: 'issueResolved',
      data: {
        workspaceId: issue.workspaceId,
        issueId: issue.id,
        userEmail: user.email,
      },
    })
  })

  it('respects tenancy and only affects evaluations from the same workspace and issue when ignoreEvaluations is true', async () => {
    // Create first workspace with issue and evaluation
    const { workspace, project, commit, documents, user } = await createProject(
      {
        documents: { 'test-doc': 'Hello world' },
      },
    )
    const document = documents[0]!

    const provider = await createProviderApiKey({
      workspace,
      user,
      type: Providers.OpenAI,
      name: 'openai',
    })

    const { issue: issue1 } = await createIssue({
      workspace,
      project,
      document,
      createdAt: new Date(),
    })

    // Create second issue in same workspace
    const { issue: issue2 } = await createIssue({
      workspace,
      project,
      document,
      createdAt: new Date(),
    })

    // Create second workspace with its own issue and evaluation
    const {
      workspace: workspace2,
      project: project2,
      commit: commit2,
      documents: documents2,
      user: user2,
    } = await createProject({
      documents: { 'test-doc': 'Hello world' },
    })
    const document2 = documents2[0]!

    const provider2 = await createProviderApiKey({
      workspace: workspace2,
      user: user2,
      type: Providers.OpenAI,
      name: 'openai',
    })

    const { issue: issue3 } = await createIssue({
      workspace: workspace2,
      project: project2,
      document: document2,
      createdAt: new Date(),
    })

    // Create evaluation linked to issue1 (should be affected)
    const eval1 = await createEvaluationV2({
      document,
      commit,
      workspace,
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        provider: provider.name,
        model: 'gpt-4o',
        criteria: 'Test criteria',
        passDescription: 'Pass',
        failDescription: 'Fail',
      },
      evaluateLiveLogs: true,
    })

    await database
      .update(evaluationVersions)
      .set({ issueId: issue1.id })
      .where(eq(evaluationVersions.id, eval1.versionId))

    // Create evaluation linked to issue2 (should NOT be affected)
    const eval2 = await createEvaluationV2({
      document,
      commit,
      workspace,
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        provider: provider.name,
        model: 'gpt-4o',
        criteria: 'Test criteria 2',
        passDescription: 'Pass',
        failDescription: 'Fail',
      },
      evaluateLiveLogs: true,
    })

    await database
      .update(evaluationVersions)
      .set({ issueId: issue2.id })
      .where(eq(evaluationVersions.id, eval2.versionId))

    // Create evaluation in different workspace (should NOT be affected)
    const eval3 = await createEvaluationV2({
      document: document2,
      commit: commit2,
      workspace: workspace2,
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        provider: provider2.name,
        model: 'gpt-4o',
        criteria: 'Test criteria 3',
        passDescription: 'Pass',
        failDescription: 'Fail',
      },
      evaluateLiveLogs: true,
    })

    await database
      .update(evaluationVersions)
      .set({ issueId: issue3.id })
      .where(eq(evaluationVersions.id, eval3.versionId))

    // Resolve issue1 with ignoreEvaluations=true
    const result = await resolveIssue({
      issue: issue1,
      user,
      ignoreEvaluations: true,
    })
    expect(result.ok).toBe(true)

    // Check eval1 was updated (linked to issue1)
    const [updatedEval1] = await database
      .select()
      .from(evaluationVersions)
      .where(eq(evaluationVersions.id, eval1.versionId))

    expect(updatedEval1!.ignoredAt).not.toBeNull()
    expect(updatedEval1!.evaluateLiveLogs).toBe(false)

    // Check eval2 was NOT updated (different issue, same workspace)
    const [updatedEval2] = await database
      .select()
      .from(evaluationVersions)
      .where(eq(evaluationVersions.id, eval2.versionId))

    expect(updatedEval2!.ignoredAt).toBeNull()
    expect(updatedEval2!.evaluateLiveLogs).toBe(true)

    // Check eval3 was NOT updated (different workspace)
    const [updatedEval3] = await database
      .select()
      .from(evaluationVersions)
      .where(eq(evaluationVersions.id, eval3.versionId))

    expect(updatedEval3!.ignoredAt).toBeNull()
    expect(updatedEval3!.evaluateLiveLogs).toBe(true)
  })
})
