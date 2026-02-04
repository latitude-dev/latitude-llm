import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { Providers } from '@latitude-data/constants'
import { database } from '../../client'
import {
  EvaluationType,
  EvaluationTriggerMode,
  LlmEvaluationMetric,
} from '../../constants'
import { createEvaluationV2 } from '../../tests/factories/evaluationsV2'
import { createIssue } from '../../tests/factories/issues'
import { createProject } from '../../tests/factories/projects'
import { createProviderApiKey } from '../../tests/factories/providerApiKeys'
import { createUser } from '../../tests/factories/users'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { issues } from '../../schema/models/issues'
import { unresolveIssue } from './unresolve'
import * as publisherModule from '../../events/publisher'

vi.mock('../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

describe('unresolveIssue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('unresolves a resolved issue', async () => {
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

    const result = await unresolveIssue({ issue: resolvedIssue!, user })

    expect(result.ok).toBe(true)
    const unresolvedIssue = result.unwrap().issue
    expect(unresolvedIssue.resolvedAt).toBeNull()
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
      .set({ mergedAt: new Date(), resolvedAt: new Date() })
      .where(eq(issues.id, issue.id))
      .returning()

    const result = await unresolveIssue({ issue: mergedIssue!, user })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toContain('Cannot unresolve a merged issue')
  })

  it('fails when issue is ignored', async () => {
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

    const result = await unresolveIssue({ issue: ignoredIssue!, user })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toContain('Cannot unresolve an ignored issue')
  })

  it('fails when issue is not resolved', async () => {
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

    const result = await unresolveIssue({ issue, user })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toContain('Issue is not resolved')
  })

  it('publishes issueUnresolved event', async () => {
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

    await unresolveIssue({ issue: resolvedIssue!, user })

    expect(publisherModule.publisher.publishLater).toHaveBeenCalledWith({
      type: 'issueUnresolved',
      data: {
        workspaceId: issue.workspaceId,
        issueId: issue.id,
        userEmail: user.email,
      },
    })
  })

  it('unignores evaluations when unresolving', async () => {
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

    // Create evaluation with live evaluation support
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
      trigger: {
        mode: EvaluationTriggerMode.Disabled,
      },
    })

    // Link evaluation to issue and mark as ignored
    await database
      .update(evaluationVersions)
      .set({ issueId: issue.id, ignoredAt: new Date() })
      .where(eq(evaluationVersions.id, evaluation.versionId))

    // Resolve the issue
    const [resolvedIssue] = await database
      .update(issues)
      .set({ resolvedAt: new Date() })
      .where(eq(issues.id, issue.id))
      .returning()

    const result = await unresolveIssue({ issue: resolvedIssue!, user })
    expect(result.ok).toBe(true)

    // Check that evaluation was unignored
    const [updatedEval] = await database
      .select()
      .from(evaluationVersions)
      .where(eq(evaluationVersions.id, evaluation.versionId))

    expect(updatedEval!.ignoredAt).toBeNull()
    expect(updatedEval!.configuration.trigger?.mode).toBe(EvaluationTriggerMode.EveryInteraction)
  })

  it('unignores evaluations even if they were not ignored during resolve', async () => {
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

    // Create evaluation with live evaluation support but NOT ignored
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
      trigger: {
        mode: EvaluationTriggerMode.Disabled,
      },
    })

    // Link evaluation to issue (not ignored)
    await database
      .update(evaluationVersions)
      .set({ issueId: issue.id })
      .where(eq(evaluationVersions.id, evaluation.versionId))

    // Resolve the issue
    const [resolvedIssue] = await database
      .update(issues)
      .set({ resolvedAt: new Date() })
      .where(eq(issues.id, issue.id))
      .returning()

    const result = await unresolveIssue({ issue: resolvedIssue!, user })
    expect(result.ok).toBe(true)

    // Check that evaluation was updated (live logs re-enabled)
    const [updatedEval] = await database
      .select()
      .from(evaluationVersions)
      .where(eq(evaluationVersions.id, evaluation.versionId))

    expect(updatedEval!.ignoredAt).toBeNull()
    expect(updatedEval!.configuration.trigger?.mode).toBe(EvaluationTriggerMode.EveryInteraction)
  })
})
