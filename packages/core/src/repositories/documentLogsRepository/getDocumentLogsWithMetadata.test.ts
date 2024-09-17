import { describe, expect, it } from 'vitest'

import { Providers } from '../../constants'
import { mergeCommit } from '../../services/commits'
import { updateDocument } from '../../services/documents'
import * as factories from '../../tests/factories'
import { DocumentLogsRepository } from './index'

const documentContent = (content: string) => `
---
provider: foo
model: bar
---
${content}
`

describe('getDocumentLogsWithMetadata', () => {
  it('return all logs from merged commits', async () => {
    const { workspace, project, user } = await factories.createProject()
    await factories.createProviderApiKey({
      workspace,
      user,
      name: 'foo',
      type: Providers.OpenAI,
    })
    const { commit: commit1 } = await factories.createDraft({ project, user })
    const { documentVersion: doc } = await factories.createDocumentVersion({
      commit: commit1,
      content: documentContent('VERSION_1'),
    })
    await mergeCommit(commit1).then((r) => r.unwrap())

    const { commit: commit2 } = await factories.createDraft({ project, user })
    await updateDocument({
      commit: commit2,
      document: doc,
      content: documentContent('VERSION_2'),
    })
    await mergeCommit(commit2).then((r) => r.unwrap())

    const { documentLog: log1 } = await factories.createDocumentLog({
      document: doc,
      commit: commit1,
    })
    const { documentLog: log2 } = await factories.createDocumentLog({
      document: doc,
      commit: commit2,
    })

    const documentsScope = new DocumentLogsRepository(project.workspaceId)
    const result = await documentsScope
      .getDocumentLogsWithMetadata({
        documentUuid: doc.documentUuid,
      })
      .then((r) => r.unwrap())

    expect(result.find((l) => l.uuid === log1.uuid)).toBeDefined()
    expect(result.find((l) => l.uuid === log2.uuid)).toBeDefined()
  })

  it('includes logs from specified draft', async () => {
    const { workspace, project, user } = await factories.createProject()
    await factories.createProviderApiKey({
      workspace,
      user,
      name: 'foo',
      type: Providers.OpenAI,
    })
    const { commit: commit1 } = await factories.createDraft({ project, user })
    const { documentVersion: doc } = await factories.createDocumentVersion({
      commit: commit1,
      content: documentContent('VERSION_1'),
    })
    await mergeCommit(commit1).then((r) => r.unwrap())

    const { commit: commit2 } = await factories.createDraft({ project, user })
    await updateDocument({
      commit: commit2,
      document: doc,
      content: documentContent('VERSION_2'),
    })
    await mergeCommit(commit2).then((r) => r.unwrap())

    const { commit: draft } = await factories.createDraft({ project, user })
    await updateDocument({
      commit: draft,
      document: doc,
      content: documentContent('VERSION_3'),
    })

    const { documentLog: log1 } = await factories.createDocumentLog({
      document: doc,
      commit: commit1,
    })
    const { documentLog: log2 } = await factories.createDocumentLog({
      document: doc,
      commit: commit2,
    })
    const { documentLog: log3 } = await factories.createDocumentLog({
      document: doc,
      commit: draft,
    })

    const documentsScope = new DocumentLogsRepository(project.workspaceId)
    const result = await documentsScope
      .getDocumentLogsWithMetadata({
        documentUuid: doc.documentUuid,
        draft: draft,
      })
      .then((r) => r.unwrap())

    expect(result.find((l) => l.uuid === log1.uuid)).toBeDefined()
    expect(result.find((l) => l.uuid === log2.uuid)).toBeDefined()
    expect(result.find((l) => l.uuid === log3.uuid)).toBeDefined()
  })

  it('does not include logs from non-specified drafts', async () => {
    const { workspace, project, user } = await factories.createProject()
    await factories.createProviderApiKey({
      workspace,
      user,
      name: 'foo',
      type: Providers.OpenAI,
    })
    const { commit: commit1 } = await factories.createDraft({ project, user })
    const { documentVersion: doc } = await factories.createDocumentVersion({
      commit: commit1,
      content: documentContent('VERSION_1'),
    })
    await mergeCommit(commit1).then((r) => r.unwrap())

    const { commit: draft1 } = await factories.createDraft({ project, user })
    await updateDocument({
      commit: draft1,
      document: doc,
      content: documentContent('VERSION_2'),
    })

    const { commit: draft2 } = await factories.createDraft({ project, user })
    await updateDocument({
      commit: draft2,
      document: doc,
      content: documentContent('VERSION_3'),
    })

    const { documentLog: log1 } = await factories.createDocumentLog({
      document: doc,
      commit: commit1,
    })
    const { documentLog: log2 } = await factories.createDocumentLog({
      document: doc,
      commit: draft1,
    })
    const { documentLog: log3 } = await factories.createDocumentLog({
      document: doc,
      commit: draft2,
    })

    const documentsScope = new DocumentLogsRepository(project.workspaceId)
    const result = await documentsScope
      .getDocumentLogsWithMetadata({
        documentUuid: doc.documentUuid,
        draft: draft1,
      })
      .then((r) => r.unwrap())

    expect(result.find((l) => l.uuid === log1.uuid)).toBeDefined()
    expect(result.find((l) => l.uuid === log2.uuid)).toBeDefined()
    expect(result.find((l) => l.uuid === log3.uuid)).not.toBeDefined()
  })

  it('returns a sum of tokens and cost', async () => {
    const { workspace, project, user } = await factories.createProject()
    await factories.createProviderApiKey({
      workspace,
      user,
      name: 'foo',
      type: Providers.OpenAI,
    })
    const { commit } = await factories.createDraft({ project, user })
    const { documentVersion: doc } = await factories.createDocumentVersion({
      commit,
      content: documentContent('<response/>\n<response/>'),
    })
    await mergeCommit(commit).then((r) => r.unwrap())

    const { documentLog: log } = await factories.createDocumentLog({
      document: doc,
      commit,
    })

    const documentsScope = new DocumentLogsRepository(project.workspaceId)
    const result = await documentsScope
      .getDocumentLogsWithMetadata({
        documentUuid: doc.documentUuid,
      })
      .then((r) => r.unwrap())

    expect(result.find((l) => l.uuid === log.uuid)).toBeDefined()
    expect(result.find((l) => l.uuid === log.uuid)?.tokens).toBeTypeOf('number')
    expect(
      result.find((l) => l.uuid === log.uuid)?.costInMillicents,
    ).toBeTypeOf('number')
  })
})
