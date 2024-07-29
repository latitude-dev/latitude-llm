import { omit } from 'lodash-es'

import { mergeCommit } from '$core/services'
import * as factories from '$core/tests/factories'
import { describe, expect, it } from 'vitest'

import { DocumentVersionsRepository } from './index'

describe('getDocumentAtCommit', () => {
  it('return doc from merged commit', async () => {
    const { project } = await factories.createProject()
    const { commit } = await factories.createDraft({ project })
    const { documentVersion: doc } = await factories.createDocumentVersion({
      commit: commit,
      content: 'VERSION_1',
    })
    const mergedCommit = await mergeCommit(commit).then((r) => r.unwrap())
    const documentUuid = doc.documentUuid

    const documentsScope = new DocumentVersionsRepository(project.workspaceId)
    const result = await documentsScope.getDocumentAtCommit({
      commit: mergedCommit,
      documentUuid,
    })
    const document = result.unwrap()

    expect(omit(document, 'id', 'updatedAt')).toEqual({
      ...omit(doc, 'id', 'updatedAt'),
      resolvedContent: 'VERSION_1',
    })
  })
})
