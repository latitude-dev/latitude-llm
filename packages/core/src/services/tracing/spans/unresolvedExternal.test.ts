import { beforeEach, describe, expect, it } from 'vitest'
import { faker } from '@faker-js/faker'
import {
  ATTR_LATITUDE_COMMIT_UUID,
  ATTR_LATITUDE_PROJECT_ID,
  ATTR_LATITUDE_PROMPT_PATH,
  ATTR_LATITUDE_TYPE,
  BaseSpanMetadata,
  ExternalSpanMetadata,
  HEAD_COMMIT,
  LogSources,
  Otlp,
  SpanStatus,
  SpanType,
} from '../../../constants'
import { type ApiKey } from '../../../schema/models/types/ApiKey'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { type Project } from '../../../schema/models/types/Project'
import { type Commit } from '../../../schema/models/types/Commit'
import { type User } from '../../../schema/models/types/User'
import * as factories from '../../../tests/factories'
import { UnresolvedExternalSpanSpecification } from './unresolvedExternal'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../repositories'
import { mergeCommit } from '../../commits'
import { TypedResult } from '../../../lib/Result'

let workspace: Workspace
let project: Project
let user: User
let apiKey: ApiKey
let headCommit: Commit

type ExternalMetadataResult = TypedResult<
  Omit<ExternalSpanMetadata, keyof BaseSpanMetadata>
>

describe('UnresolvedExternalSpanSpecification', () => {
  beforeEach(async () => {
    const setup = await factories.createProject({
      documents: {
        'existing-prompt': 'This is an existing prompt',
      },
    })
    workspace = setup.workspace
    project = setup.project
    user = setup.user
    headCommit = setup.commit

    const { apiKey: key } = await factories.createApiKey({ workspace })
    apiKey = key
  })

  function createProcessArgs(overrides: {
    promptPath: string
    projectId: number
    versionUuid?: string
  }) {
    return {
      attributes: {
        [ATTR_LATITUDE_TYPE]: SpanType.UnresolvedExternal,
        [ATTR_LATITUDE_PROMPT_PATH]: overrides.promptPath,
        [ATTR_LATITUDE_PROJECT_ID]: overrides.projectId,
        ...(overrides.versionUuid && {
          [ATTR_LATITUDE_COMMIT_UUID]: overrides.versionUuid,
        }),
      },
      status: SpanStatus.Ok,
      scope: { name: 'test-scope', version: '1.0.0' } as Otlp.Scope,
      apiKey,
      workspace,
    }
  }

  describe('when prompt exists in the commit', () => {
    it('resolves to the existing document version', async () => {
      const args = createProcessArgs({
        promptPath: 'existing-prompt',
        projectId: project.id,
        versionUuid: headCommit.uuid,
      })

      const result = (await UnresolvedExternalSpanSpecification.process(
        args,
      )) as ExternalMetadataResult

      expect(result.error).toBeUndefined()
      expect(result.value).toBeDefined()
      expect(result.value!.promptUuid).toBeDefined()
      expect(result.value!.documentLogUuid).toBeDefined()
      expect(result.value!.source).toBe(LogSources.API)
      expect(result.value!.versionUuid).toBe(headCommit.uuid)
    })

    it('resolves using HEAD commit when no versionUuid is provided', async () => {
      const args = createProcessArgs({
        promptPath: 'existing-prompt',
        projectId: project.id,
      })

      const result = (await UnresolvedExternalSpanSpecification.process(
        args,
      )) as ExternalMetadataResult

      expect(result.error).toBeUndefined()
      expect(result.value).toBeDefined()
      expect(result.value!.promptUuid).toBeDefined()
    })
  })

  describe('when prompt does not exist and commit is a draft', () => {
    it('creates the prompt in the draft commit', async () => {
      const { commit: draft } = await factories.createDraft({ project, user })

      const args = createProcessArgs({
        promptPath: 'new-prompt-in-draft',
        projectId: project.id,
        versionUuid: draft.uuid,
      })

      const result = (await UnresolvedExternalSpanSpecification.process(
        args,
      )) as ExternalMetadataResult

      expect(result.error).toBeUndefined()
      expect(result.value).toBeDefined()
      expect(result.value!.promptUuid).toBeDefined()
      expect(result.value!.versionUuid).toBe(draft.uuid)

      const docsRepo = new DocumentVersionsRepository(workspace.id)
      const docs = await docsRepo.getDocumentsAtCommit(draft)
      const newDoc = docs.unwrap().find((d) => d.path === 'new-prompt-in-draft')
      expect(newDoc).toBeDefined()
      expect(newDoc!.documentUuid).toBe(result.value!.promptUuid)
    })
  })

  describe('when prompt does not exist and commit is HEAD', () => {
    // TODO: Fix bug in unresolvedExternal.ts - createCommit uses version: 0 which conflicts
    // with existing head commit's version. Should use next version number.
    it('creates a new merged commit containing the new prompt', async () => {
      const args = createProcessArgs({
        promptPath: 'new-prompt-at-head',
        projectId: project.id,
      })

      const result = (await UnresolvedExternalSpanSpecification.process(
        args,
      )) as ExternalMetadataResult

      expect(result.error).toBeUndefined()
      expect(result.value).toBeDefined()
      expect(result.value!.promptUuid).toBeDefined()
      expect(result.value!.versionUuid).toBeDefined()
      expect(result.value!.versionUuid).not.toBe(headCommit.uuid)

      const commitsRepo = new CommitsRepository(workspace.id)
      const newHeadCommit = await commitsRepo.getCommitByUuid({
        uuid: HEAD_COMMIT,
        projectId: project.id,
      })
      expect(newHeadCommit.value).toBeDefined()
      expect(newHeadCommit.value!.mergedAt).not.toBeNull()

      const docsRepo = new DocumentVersionsRepository(workspace.id)
      const docs = await docsRepo.getDocumentsAtCommit(newHeadCommit.value!)
      const newDoc = docs.unwrap().find((d) => d.path === 'new-prompt-at-head')
      expect(newDoc).toBeDefined()
      expect(newDoc!.documentUuid).toBe(result.value!.promptUuid)
    })

    // TODO: Same bug as above
    it('creates prompt when using HEAD_COMMIT constant as versionUuid', async () => {
      const args = createProcessArgs({
        promptPath: 'new-prompt-with-head-constant',
        projectId: project.id,
        versionUuid: HEAD_COMMIT,
      })

      const result = (await UnresolvedExternalSpanSpecification.process(
        args,
      )) as ExternalMetadataResult

      expect(result.error).toBeUndefined()
      expect(result.value).toBeDefined()
      expect(result.value!.promptUuid).toBeDefined()
    })
  })

  describe('when prompt does not exist and commit is merged but not HEAD', () => {
    // TODO: This test depends on the HEAD creation flow which has a bug (version: 0)
    // Once that bug is fixed, this test should pass.
    it('falls back to HEAD and creates the prompt there', async () => {
      // Create a merged commit that will become "old" (not HEAD)
      const { commit: draft } = await factories.createDraft({ project, user })
      // Add a document to make the draft have changes
      await factories.createDocumentVersion({
        commit: draft,
        path: 'temp-doc-1',
        content: 'temp content',
        workspace,
        user,
      })
      const mergedCommit = (await mergeCommit(draft)).unwrap()

      // Create another commit to become the new HEAD
      const { commit: anotherDraft } = await factories.createDraft({
        project,
        user,
      })
      await factories.createDocumentVersion({
        commit: anotherDraft,
        path: 'temp-doc-2',
        content: 'temp content 2',
        workspace,
        user,
      })
      await mergeCommit(anotherDraft)

      const args = createProcessArgs({
        promptPath: 'new-prompt-fallback-to-head',
        projectId: project.id,
        versionUuid: mergedCommit.uuid,
      })

      const result = (await UnresolvedExternalSpanSpecification.process(
        args,
      )) as ExternalMetadataResult

      expect(result.error).toBeUndefined()
      expect(result.value).toBeDefined()
      expect(result.value!.promptUuid).toBeDefined()
      expect(result.value!.versionUuid).not.toBe(mergedCommit.uuid)

      const commitsRepo = new CommitsRepository(workspace.id)
      const currentHead = await commitsRepo.getCommitByUuid({
        uuid: HEAD_COMMIT,
        projectId: project.id,
      })

      const docsRepo = new DocumentVersionsRepository(workspace.id)
      const docs = await docsRepo.getDocumentsAtCommit(currentHead.value!)
      const newDoc = docs
        .unwrap()
        .find((d) => d.path === 'new-prompt-fallback-to-head')
      expect(newDoc).toBeDefined()
    })

    it('resolves existing prompt from an older merged commit', async () => {
      // The initial headCommit already has 'existing-prompt'
      // So querying with headCommit.uuid (which is merged) should find it
      const args = createProcessArgs({
        promptPath: 'existing-prompt',
        projectId: project.id,
        versionUuid: headCommit.uuid,
      })

      const result = (await UnresolvedExternalSpanSpecification.process(
        args,
      )) as ExternalMetadataResult

      expect(result.error).toBeUndefined()
      expect(result.value).toBeDefined()
      expect(result.value!.promptUuid).toBeDefined()
      expect(result.value!.versionUuid).toBe(headCommit.uuid)
    })
  })

  describe('attribute handling', () => {
    it('removes unresolved attributes and adds resolved ones', async () => {
      const args = createProcessArgs({
        promptPath: 'existing-prompt',
        projectId: project.id,
        versionUuid: headCommit.uuid,
      })

      const result = (await UnresolvedExternalSpanSpecification.process(
        args,
      )) as ExternalMetadataResult

      expect(result.error).toBeUndefined()
      expect(result.value!.promptUuid).toBeDefined()
      expect(result.value!.documentLogUuid).toBeDefined()
      expect(result.value!.source).toBe(LogSources.API)
    })

    it('generates a unique documentLogUuid for each call', async () => {
      const args = createProcessArgs({
        promptPath: 'existing-prompt',
        projectId: project.id,
      })

      const result1 = (await UnresolvedExternalSpanSpecification.process(
        args,
      )) as ExternalMetadataResult
      const result2 = (await UnresolvedExternalSpanSpecification.process(
        args,
      )) as ExternalMetadataResult

      expect(result1.value!.documentLogUuid).not.toBe(
        result2.value!.documentLogUuid,
      )
    })
  })

  describe('error handling', () => {
    it('throws error when project does not exist', async () => {
      const args = createProcessArgs({
        promptPath: 'some-prompt',
        projectId: 999999,
      })

      // Currently throws NotFoundError instead of returning Result.error
      await expect(
        UnresolvedExternalSpanSpecification.process(args),
      ).rejects.toThrow('Project not found')
    })

    it('throws error when commit uuid is invalid format', async () => {
      const args = createProcessArgs({
        promptPath: 'some-prompt',
        projectId: project.id,
        versionUuid: 'non-existent-uuid',
      })

      // Currently throws database error for invalid UUID format
      await expect(
        UnresolvedExternalSpanSpecification.process(args),
      ).rejects.toThrow()
    })

    it('throws error when commit uuid does not exist', async () => {
      const args = createProcessArgs({
        promptPath: 'some-prompt',
        projectId: project.id,
        versionUuid: faker.string.uuid(),
      })

      // Currently throws because commitResult.unwrap() is called without checking error first
      await expect(
        UnresolvedExternalSpanSpecification.process(args),
      ).rejects.toThrow('not found')
    })
  })
})
