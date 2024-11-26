import { beforeAll, describe, expect, it } from 'vitest'

import {
  DocumentVersion,
  Project,
  Providers,
  User,
  Workspace,
} from '../../browser'
import { UnprocessableEntityError } from '../../lib'
import * as factories from '../../tests/factories'
import { createPublishedDocument } from './create'

let workspace: Workspace
let user: User
let document: DocumentVersion
let project: Project
describe('findOrCreate', () => {
  beforeAll(async () => {
    const {
      workspace: wsp,
      user: usr,
      documents,
      project: prj,
    } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'foo',
        }),
      },
    })
    user = usr
    workspace = wsp
    document = documents[0]!
    project = prj
  })

  it('creates a new published document', async () => {
    const result = await createPublishedDocument({
      workspace,
      project,
      document,
    })
    expect(result.value).toEqual(
      expect.objectContaining({
        title: 'doc1',
        uuid: expect.any(String),
        documentUuid: document.documentUuid,
        projectId: project.id,
        isPublished: false,
        canFollowConversation: false,
      }),
    )
  })

  it('fails if document already has a published document', async () => {
    await factories.createPublishedDocument({
      workspace,
      project,
      document,
    })
    const result = await createPublishedDocument({
      workspace,
      project,
      document,
    })

    expect(result.error).toEqual(
      new UnprocessableEntityError(
        'Document already has a published version.',
        {
          documentUuid: 'Document already has a published version.',
        },
      ),
    )
  })

  it('fails if document is not in a live commit', async () => {
    const { commit: draft } = await factories.createDraft({ project, user })
    let { documentVersion: drafDoc } = await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft,
      path: 'fake-path',
      content: factories.helpers.createPrompt({
        provider: 'openai',
        model: 'fake-model',
      }),
    })

    const result = await createPublishedDocument({
      workspace,
      project,
      document: drafDoc,
    })

    expect(result.error).toEqual(
      new UnprocessableEntityError('Only live documents can be shared.', {
        documentUuid: 'Only live documents can be shared.',
      }),
    )
  })
})
