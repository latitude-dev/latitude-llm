import { beforeEach, describe, expect, it } from 'vitest'
import { faker } from '@faker-js/faker'
import { ATTRIBUTES, HEAD_COMMIT, LogSources } from '../../../../constants'
import * as factories from '../../../../tests/factories'
import { type Workspace } from '../../../../schema/models/types/Workspace'
import { type Project } from '../../../../schema/models/types/Project'
import { type Commit } from '../../../../schema/models/types/Commit'
import { type User } from '../../../../schema/models/types/User'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../../repositories'
import { mergeCommit } from '../../../commits'
import { resolveCaptureAttributes } from './captureReferences'

let workspace: Workspace
let project: Project
let user: User
let headCommit: Commit

describe('resolveCaptureAttributes', () => {
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
  })

  function createAttributes(overrides: {
    promptPath: string
    projectId: number
    versionUuid?: string
    documentLogUuid?: string
  }) {
    return {
      [ATTRIBUTES.LATITUDE.promptPath]: overrides.promptPath,
      [ATTRIBUTES.LATITUDE.projectId]: overrides.projectId,
      ...(overrides.versionUuid && {
        [ATTRIBUTES.LATITUDE.commitUuid]: overrides.versionUuid,
      }),
      ...(overrides.documentLogUuid && {
        [ATTRIBUTES.LATITUDE.documentLogUuid]: overrides.documentLogUuid,
      }),
    }
  }

  it('resolves existing prompt without creating new records', async () => {
    const result = await resolveCaptureAttributes({
      attributes: createAttributes({
        promptPath: 'existing-prompt',
        projectId: project.id,
        versionUuid: headCommit.uuid,
      }),
      workspace,
    })

    expect(result.error).toBeUndefined()
    expect(result.value?.[ATTRIBUTES.LATITUDE.documentUuid]).toBeDefined()
    expect(result.value?.[ATTRIBUTES.LATITUDE.commitUuid]).toBe(headCommit.uuid)
    expect(result.value?.[ATTRIBUTES.LATITUDE.documentLogUuid]).toBeDefined()
    expect(result.value?.[ATTRIBUTES.LATITUDE.source]).toBe(LogSources.API)
  })

  it('creates prompt in draft commit when missing', async () => {
    const { commit: draft } = await factories.createDraft({ project, user })

    const result = await resolveCaptureAttributes({
      attributes: createAttributes({
        promptPath: 'created-in-draft',
        projectId: project.id,
        versionUuid: draft.uuid,
      }),
      workspace,
    })

    expect(result.error).toBeUndefined()
    expect(result.value?.[ATTRIBUTES.LATITUDE.commitUuid]).toBe(draft.uuid)

    const docsRepo = new DocumentVersionsRepository(workspace.id)
    const docs = await docsRepo
      .getDocumentsAtCommit(draft)
      .then((r) => r.unwrap())
    expect(docs.find((d) => d.path === 'created-in-draft')).toBeDefined()
  })

  it('creates and merges a new commit when path is missing at HEAD', async () => {
    const result = await resolveCaptureAttributes({
      attributes: createAttributes({
        promptPath: 'created-at-head',
        projectId: project.id,
      }),
      workspace,
    })

    expect(result.error).toBeUndefined()
    expect(result.value?.[ATTRIBUTES.LATITUDE.commitUuid]).toBeDefined()
    expect(result.value?.[ATTRIBUTES.LATITUDE.commitUuid]).not.toBe(
      headCommit.uuid,
    )

    const commitsRepo = new CommitsRepository(workspace.id)
    const newHead = await commitsRepo
      .getCommitByUuid({ uuid: HEAD_COMMIT, projectId: project.id })
      .then((r) => r.unwrap())

    const docsRepo = new DocumentVersionsRepository(workspace.id)
    const docs = await docsRepo
      .getDocumentsAtCommit(newHead)
      .then((r) => r.unwrap())
    expect(docs.find((d) => d.path === 'created-at-head')).toBeDefined()
  })

  it('falls back to HEAD when requested merged commit misses prompt', async () => {
    const { commit: draftOne } = await factories.createDraft({ project, user })
    await factories.createDocumentVersion({
      commit: draftOne,
      path: 'temp-doc-1',
      content: 'temp content',
      workspace,
      user,
    })
    const olderMerged = await mergeCommit(draftOne).then((r) => r.unwrap())

    const { commit: draftTwo } = await factories.createDraft({ project, user })
    await factories.createDocumentVersion({
      commit: draftTwo,
      path: 'temp-doc-2',
      content: 'temp content 2',
      workspace,
      user,
    })
    await mergeCommit(draftTwo)

    const result = await resolveCaptureAttributes({
      attributes: createAttributes({
        promptPath: 'created-from-fallback',
        projectId: project.id,
        versionUuid: olderMerged.uuid,
      }),
      workspace,
    })

    expect(result.error).toBeUndefined()
    expect(result.value?.[ATTRIBUTES.LATITUDE.commitUuid]).not.toBe(
      olderMerged.uuid,
    )
  })

  it('preserves provided document log uuid', async () => {
    const documentLogUuid = faker.string.uuid()
    const result = await resolveCaptureAttributes({
      attributes: createAttributes({
        promptPath: 'existing-prompt',
        projectId: project.id,
        documentLogUuid,
      }),
      workspace,
    })

    expect(result.error).toBeUndefined()
    expect(result.value?.[ATTRIBUTES.LATITUDE.documentLogUuid]).toBe(
      documentLogUuid,
    )
  })

  it('returns not found when project does not exist', async () => {
    const result = await resolveCaptureAttributes({
      attributes: createAttributes({
        promptPath: 'missing-project',
        projectId: 999999,
      }),
      workspace,
    })

    expect(result.error).toBeDefined()
    expect(String(result.error)).toContain('Project not found')
  })

  it('returns error when commit uuid is invalid or missing', async () => {
    const invalidUuid = await resolveCaptureAttributes({
      attributes: createAttributes({
        promptPath: 'existing-prompt',
        projectId: project.id,
        versionUuid: 'non-existent-uuid',
      }),
      workspace,
    })

    const unknownUuid = await resolveCaptureAttributes({
      attributes: createAttributes({
        promptPath: 'existing-prompt',
        projectId: project.id,
        versionUuid: faker.string.uuid(),
      }),
      workspace,
    })

    expect(invalidUuid.error).toBeDefined()
    expect(unknownUuid.error).toBeDefined()
  })
})
