import { beforeAll, describe, expect, it } from 'vitest'

import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { Providers } from '@latitude-data/constants'
import * as factories from '../../tests/factories'
import { UnprocessableEntityError } from './../../lib/errors'
import { createPublishedDocument } from './create'

let workspace: Workspace
let user: User
let document: DocumentVersion
let commit: Commit
let project: Project
describe('findOrCreate', () => {
  beforeAll(async () => {
    const {
      workspace: wsp,
      user: usr,
      documents,
      project: prj,
      commit: cmt,
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
    commit = cmt
  })

  it('creates a new published document', async () => {
    const result = await createPublishedDocument({
      workspace,
      project,
      document,
      commitUuid: commit.uuid,
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
      commitUuid: commit.uuid,
    })

    const result = await createPublishedDocument({
      workspace,
      project,
      document,
      commitUuid: commit.uuid,
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
    const { documentVersion: drafDoc } = await factories.createDocumentVersion({
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
      commitUuid: draft.uuid,
    })

    expect(result.error).toEqual(
      new UnprocessableEntityError('Only live documents can be shared.', {
        documentUuid: 'Only live documents can be shared.',
      }),
    )
  })
})
