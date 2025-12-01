import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { Providers } from '@latitude-data/constants'
import { database } from '../../client'
import {
  EvaluationType,
  LlmEvaluationMetric,
  RuleEvaluationMetric,
} from '../../constants'
import { createEvaluationV2 } from '../../tests/factories/evaluationsV2'
import { createIssue } from '../../tests/factories/issues'
import { createProject } from '../../tests/factories/projects'
import { createUser } from '../../tests/factories/users'
import { createProviderApiKey } from '../../tests/factories/providerApiKeys'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { ignoreIssue } from './ignore'
import * as publisherModule from '../../events/publisher'

vi.mock('../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

describe('ignoreIssue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ignores an active issue', async () => {
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

    const result = await ignoreIssue({ issue, user })

    expect(result.ok).toBe(true)
    const ignoredIssue = result.unwrap().issue
    expect(ignoredIssue.ignoredAt).not.toBeNull()
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

    // Manually set resolvedAt
    const [resolvedIssue] = await database
      .update(await import('../../schema/models/issues').then((m) => m.issues))
      .set({ resolvedAt: new Date() })
      .where(
        eq(
          (await import('../../schema/models/issues').then((m) => m.issues)).id,
          issue.id,
        ),
      )
      .returning()

    const result = await ignoreIssue({ issue: resolvedIssue!, user })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toContain('Cannot ignore a resolved issue')
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

    // Ignore the issue first
    const firstResult = await ignoreIssue({ issue, user })
    const ignoredIssue = firstResult.unwrap().issue

    // Try to ignore again
    const result = await ignoreIssue({ issue: ignoredIssue, user })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toContain('Issue is already ignored')
  })

  it('publishes issueIgnored event', async () => {
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

    await ignoreIssue({ issue, user })

    expect(publisherModule.publisher.publishLater).toHaveBeenCalledWith({
      type: 'issueIgnored',
      data: {
        workspaceId: issue.workspaceId,
        issueId: issue.id,
        userEmail: user.email,
      },
    })
  })

  it('sets ignoredAt and disables evaluateLiveLogs on associated live evaluations', async () => {
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

    const { issue } = await createIssue({
      workspace,
      project,
      document,
      createdAt: new Date(),
    })

    // Create evaluation with live evaluation support (LLM Binary supports it)
    const evaluation = await createEvaluationV2<
      EvaluationType.Llm,
      LlmEvaluationMetric.Binary
    >({
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

    // Link evaluation to issue
    await database
      .update(evaluationVersions)
      .set({ issueId: issue.id })
      .where(eq(evaluationVersions.id, evaluation.versionId))

    const result = await ignoreIssue({ issue, user })
    expect(result.ok).toBe(true)

    // Check that evaluation was updated
    const [updatedEval] = await database
      .select()
      .from(evaluationVersions)
      .where(eq(evaluationVersions.id, evaluation.versionId))

    expect(updatedEval!.ignoredAt).not.toBeNull()
    expect(updatedEval!.evaluateLiveLogs).toBe(false)
  })

  it('does not affect evaluations that do not support live evaluation', async () => {
    const { workspace, project, commit, documents } = await createProject({
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

    // Create evaluation without live evaluation support (Rule ExactMatch doesn't support it)
    const evaluation = await createEvaluationV2({
      document,
      commit,
      workspace,
      type: EvaluationType.Rule,
      metric: RuleEvaluationMetric.ExactMatch,
      configuration: {
        reverseScale: false,
        actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
        expectedOutput: { parsingFormat: 'string' },
        caseInsensitive: false,
      },
    })

    // Link evaluation to issue
    await database
      .update(evaluationVersions)
      .set({ issueId: issue.id })
      .where(eq(evaluationVersions.id, evaluation.versionId))

    const result = await ignoreIssue({ issue, user })
    expect(result.ok).toBe(true)

    // Check that evaluation was NOT updated (no live support)
    const [updatedEval] = await database
      .select()
      .from(evaluationVersions)
      .where(eq(evaluationVersions.id, evaluation.versionId))

    expect(updatedEval!.ignoredAt).toBeNull()
  })
})
