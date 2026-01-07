import { Providers } from '@latitude-data/constants'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { database } from '../../client'
import {
  CompositeEvaluationConfiguration,
  CompositeEvaluationMetric,
  EvaluationType,
  LlmEvaluationMetric,
} from '../../constants'
import { Result } from '../../lib/Result'
import { publisher } from '../../events/publisher'
import { DocumentVersionsRepository } from '../../repositories'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Issue } from '../../schema/models/types/Issue'
import { type Project } from '../../schema/models/types/Project'
import { type Workspace } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import { syncDefaultCompositeTarget } from './sync'

describe('syncDefaultCompositeTarget', () => {
  let mocks: {
    publisher: MockInstance
  }

  let workspace: Workspace
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let issue: Issue

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    const {
      workspace: w,
      project: p,
      documents,
      commit: c,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        prompt: factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      },
      skipMerge: true,
    })

    workspace = w
    project = p
    commit = c
    document = documents[0]!

    const { issue: i } = await factories.createIssue({
      document,
      workspace,
      project,
    })
    issue = i

    mocks = {
      publisher: vi
        .spyOn(publisher, 'publishLater')
        .mockImplementation(async () => {}),
    }
  })

  async function createLlmEvaluation(issueId?: number) {
    return factories.createEvaluationV2({
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
        provider: 'openai',
        model: 'gpt-4o',
        criteria: 'test criteria',
        passDescription: 'pass',
        failDescription: 'fail',
      },
      issueId,
    })
  }

  async function getDocument() {
    const repo = new DocumentVersionsRepository(workspace.id)
    return repo
      .getDocumentAtCommit({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })
      .then((r) => r.unwrap())
  }

  async function getCompositeEvaluation(uuid: string) {
    const result = await database
      .select()
      .from(evaluationVersions)
      .where(
        and(
          eq(evaluationVersions.evaluationUuid, uuid),
          eq(evaluationVersions.commitId, commit.id),
        ),
      )
      .then((r) => r[0])

    if (!result) return undefined

    return {
      ...result,
      configuration:
        result.configuration as CompositeEvaluationConfiguration<CompositeEvaluationMetric>,
    }
  }

  describe('when no composite exists', () => {
    it('does nothing when evaluation has no issue', async () => {
      const evaluation = await createLlmEvaluation()
      mocks.publisher.mockClear()

      const result = await syncDefaultCompositeTarget({
        evaluation,
        issueId: null,
        document,
        commit,
        workspace,
      })

      expect(Result.isOk(result)).toBe(true)
      expect(result.unwrap()).toBeUndefined()

      const updatedDocument = await getDocument()
      expect(updatedDocument.mainEvaluationUuid).toBeNull()
    })

    it('creates composite when evaluation has an issue', async () => {
      const evaluation = await createLlmEvaluation()
      mocks.publisher.mockClear()

      const result = await syncDefaultCompositeTarget({
        evaluation,
        issueId: issue.id,
        document,
        commit,
        workspace,
      })

      const composite = result.unwrap()!
      expect(composite).toEqual(
        expect.objectContaining({
          type: EvaluationType.Composite,
          metric: CompositeEvaluationMetric.Average,
          name: 'Performance',
          configuration: expect.objectContaining({
            evaluationUuids: expect.arrayContaining([evaluation.uuid]),
          }),
        }),
      )

      const updatedDocument = await getDocument()
      expect(updatedDocument.mainEvaluationUuid).toBe(composite.uuid)
    })
  })

  describe('when composite exists and evaluation is included', () => {
    it('does nothing when evaluation still has an issue', async () => {
      const evaluation = await createLlmEvaluation(issue.id)
      const doc = await getDocument()
      const compositeUuid = doc.mainEvaluationUuid!

      mocks.publisher.mockClear()

      const result = await syncDefaultCompositeTarget({
        evaluation,
        issueId: issue.id,
        document: doc,
        commit,
        workspace,
      })

      expect(Result.isOk(result)).toBe(true)
      expect(result.unwrap()).toBeUndefined()

      const updatedDocument = await getDocument()
      expect(updatedDocument.mainEvaluationUuid).toBe(compositeUuid)
    })

    it('deletes composite when evaluation loses issue and is the last one', async () => {
      const evaluation = await createLlmEvaluation(issue.id)
      const doc = await getDocument()
      const compositeUuid = doc.mainEvaluationUuid!

      mocks.publisher.mockClear()

      const result = await syncDefaultCompositeTarget({
        evaluation,
        issueId: null,
        document: doc,
        commit,
        workspace,
      })

      expect(Result.isOk(result)).toBe(true)
      expect(result.unwrap()).toBeUndefined()

      const updatedDocument = await getDocument()
      expect(updatedDocument.mainEvaluationUuid).toBeNull()

      const composite = await getCompositeEvaluation(compositeUuid)
      expect(composite?.deletedAt).not.toBeNull()
    })

    it('removes evaluation from composite when it loses issue and is not the last one', async () => {
      const evaluation1 = await createLlmEvaluation(issue.id)
      let doc = await getDocument()

      const { issue: issue2 } = await factories.createIssue({
        document,
        workspace,
        project,
      })
      const evaluation2 = await createLlmEvaluation()

      await syncDefaultCompositeTarget({
        evaluation: evaluation2,
        issueId: issue2.id,
        document: doc,
        commit,
        workspace,
      })

      doc = await getDocument()
      const compositeUuid = doc.mainEvaluationUuid!
      const compositeBefore = await getCompositeEvaluation(compositeUuid)
      expect(compositeBefore?.configuration.evaluationUuids).toHaveLength(2)

      mocks.publisher.mockClear()

      const result = await syncDefaultCompositeTarget({
        evaluation: evaluation1,
        issueId: null,
        document: doc,
        commit,
        workspace,
      })

      expect(Result.isOk(result)).toBe(true)
      const updatedComposite = result.unwrap()!
      expect(updatedComposite).toBeDefined()
      expect(updatedComposite.configuration.evaluationUuids).toHaveLength(1)
      expect(updatedComposite.configuration.evaluationUuids).not.toContain(
        evaluation1.uuid,
      )
      expect(updatedComposite.configuration.evaluationUuids).toContain(
        evaluation2.uuid,
      )

      const updatedDocument = await getDocument()
      expect(updatedDocument.mainEvaluationUuid).toBe(compositeUuid)
    })
  })

  describe('when composite exists but evaluation is not included', () => {
    it('does nothing when evaluation has no issue', async () => {
      const evaluation1 = await createLlmEvaluation(issue.id)
      const evaluation2 = await createLlmEvaluation()
      const doc = await getDocument()
      const compositeUuid = doc.mainEvaluationUuid!

      mocks.publisher.mockClear()

      const result = await syncDefaultCompositeTarget({
        evaluation: evaluation2,
        issueId: null,
        document: doc,
        commit,
        workspace,
      })

      expect(Result.isOk(result)).toBe(true)
      expect(result.unwrap()).toBeUndefined()

      const composite = await getCompositeEvaluation(compositeUuid)
      expect(composite?.configuration.evaluationUuids).toHaveLength(1)
      expect(composite?.configuration.evaluationUuids).toContain(
        evaluation1.uuid,
      )
    })

    it('adds evaluation to composite when it gains an issue', async () => {
      const evaluation1 = await createLlmEvaluation(issue.id)
      const evaluation2 = await createLlmEvaluation()
      const doc = await getDocument()
      const compositeUuid = doc.mainEvaluationUuid!

      const { issue: issue2 } = await factories.createIssue({
        document,
        workspace,
        project,
      })

      mocks.publisher.mockClear()

      const result = await syncDefaultCompositeTarget({
        evaluation: evaluation2,
        issueId: issue2.id,
        document: doc,
        commit,
        workspace,
      })

      expect(Result.isOk(result)).toBe(true)
      const updatedComposite = result.unwrap()!
      expect(updatedComposite).toBeDefined()
      expect(updatedComposite.configuration.evaluationUuids).toHaveLength(2)
      expect(updatedComposite.configuration.evaluationUuids).toContain(
        evaluation1.uuid,
      )
      expect(updatedComposite.configuration.evaluationUuids).toContain(
        evaluation2.uuid,
      )

      const updatedDocument = await getDocument()
      expect(updatedDocument.mainEvaluationUuid).toBe(compositeUuid)
    })
  })
})
