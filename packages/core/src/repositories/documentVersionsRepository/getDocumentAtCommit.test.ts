import { omit } from 'lodash-es'

import { describe, expect, it } from 'vitest'

import { mergeCommit } from '../../services/commits'
import * as factories from '../../tests/factories'
import { DocumentVersionsRepository } from './index'

describe('getDocumentAtCommit', () => {
  it('return doc from merged commit', async () => {
    const { workspace, project, user, providers } =
      await factories.createProject()
    const { commit } = await factories.createDraft({ project, user })
    const { documentVersion: doc } = await factories.createDocumentVersion({
      workspace,
      user,
      commit: commit,
      path: 'folder1/doc1',
      content: factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'VERSION_1',
      }),
    })
    const mergedCommit = await mergeCommit(commit).then((r) => r.unwrap())
    const documentUuid = doc.documentUuid

    const documentsScope = new DocumentVersionsRepository(project.workspaceId)
    const result = await documentsScope.getDocumentAtCommit({
      projectId: project.id,
      commitUuid: mergedCommit.uuid,
      documentUuid,
    })
    const document = result.unwrap()

    expect(omit(document, 'id', 'updatedAt', 'resolvedContent')).toEqual({
      ...omit(doc, 'id', 'updatedAt', 'resolvedContent'),
      projectId: project.id,
      mergedAt: mergedCommit.mergedAt,
    })
    expect(document.resolvedContent).toEqual(doc.content)
  })
})
