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
import { createProviderApiKey } from '../../tests/factories/providerApiKeys'
import { createUser } from '../../tests/factories/users'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { issues } from '../../schema/models/issues'
import { unignoreIssue } from './unignore'
import * as publisherModule from '../../events/publisher'

vi.mock('../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

describe('unignoreIssue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('unignores an ignored issue', async () => {
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

    const result = await unignoreIssue({ issue: ignoredIssue!, user })

    expect(result.ok).toBe(true)
    const unignoredIssue = result.unwrap().issue
    expect(unignoredIssue.ignoredAt).toBeNull()
  })

  it('fails when issue is merged', async () => {
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

    const [mergedIssue] = await database
      .update(issues)
      .set({ mergedAt: new Date(), ignoredAt: new Date() })
      .where(eq(issues.id, issue.id))
      .returning()

    const result = await unignoreIssue({ issue: mergedIssue!, user })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toContain('Cannot unignore a merged issue')
  })

  it('fails when issue is resolved', async () => {
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
      .update(issues)
      .set({ resolvedAt: new Date() })
      .where(eq(issues.id, issue.id))
      .returning()

    const result = await unignoreIssue({ issue: resolvedIssue!, user })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toContain('Cannot unignore a resolved issue')
  })

  it('fails when issue is not ignored', async () => {
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

    const result = await unignoreIssue({ issue, user })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toContain('Issue is not ignored')
  })

  it('publishes issueUnignored event', async () => {
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

    await unignoreIssue({ issue: ignoredIssue!, user })

    expect(publisherModule.publisher.publishLater).toHaveBeenCalledWith({
      type: 'issueUnignored',
      data: {
        workspaceId: issue.workspaceId,
        issueId: issue.id,
        userEmail: user.email,
      },
    })
  })

  it('clears ignoredAt and re-enables evaluateLiveLogs on associated live evaluations', async () => {
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
    const evaluation = await createEvaluationV2({
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
      evaluateLiveLogs: false, // Start with live logs disabled
    })

    // Link evaluation to issue and set as ignored
    await database
      .update(evaluationVersions)
      .set({ issueId: issue.id, ignoredAt: new Date() })
      .where(eq(evaluationVersions.id, evaluation.versionId))

    // Ignore the issue
    const [ignoredIssue] = await database
      .update(issues)
      .set({ ignoredAt: new Date() })
      .where(eq(issues.id, issue.id))
      .returning()

    const result = await unignoreIssue({ issue: ignoredIssue!, user })
    expect(result.ok).toBe(true)

    // Check that evaluation was updated
    const [updatedEval] = await database
      .select()
      .from(evaluationVersions)
      .where(eq(evaluationVersions.id, evaluation.versionId))

    expect(updatedEval!.ignoredAt).toBeNull()
    expect(updatedEval!.evaluateLiveLogs).toBe(true)
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

    // Ignore the issue
    const [ignoredIssue] = await database
      .update(issues)
      .set({ ignoredAt: new Date() })
      .where(eq(issues.id, issue.id))
      .returning()

    const result = await unignoreIssue({ issue: ignoredIssue!, user })
    expect(result.ok).toBe(true)

    // Check that evaluation was NOT updated (no live support)
    const [updatedEval] = await database
      .select()
      .from(evaluationVersions)
      .where(eq(evaluationVersions.id, evaluation.versionId))

    // evaluateLiveLogs should remain as it was (null/undefined for rule evals)
    expect(updatedEval!.ignoredAt).toBeNull()
  })
})
