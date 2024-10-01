import { describe, expect, it } from 'vitest'

import { mergeCommit } from '../../services/commits'
import { updateDocument } from '../../services/documents'
import * as factories from '../../tests/factories'
import { computeDocumentLogsWithMetadataQuery } from './computeDocumentLogsWithMetadata'

describe('getDocumentLogsWithMetadata', () => {
  it('return all logs from merged commits', async () => {
    const { project, user, workspace, providers } =
      await factories.createProject()
    const { commit: commit1 } = await factories.createDraft({ project, user })
    const { documentVersion: doc } = await factories.createDocumentVersion({
      workspace,
      user,
      commit: commit1,
      path: 'folder1/doc1',
      content: factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'VERSION_1',
      }),
    })
    await mergeCommit(commit1).then((r) => r.unwrap())

    const { commit: commit2 } = await factories.createDraft({ project, user })
    await updateDocument({
      commit: commit2,
      document: doc,
      content: factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'VERSION_2',
      }),
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

    const result = await computeDocumentLogsWithMetadataQuery({
      workspaceId: project.workspaceId,
      documentUuid: doc.documentUuid,
      draft: commit2,
    })

    expect(result.find((l) => l.uuid === log1.uuid)).toBeDefined()
    expect(result.find((l) => l.uuid === log2.uuid)).toBeDefined()
  })

  it('includes logs from specified draft', async () => {
    const { project, user, workspace, providers } =
      await factories.createProject()
    const { commit: commit1 } = await factories.createDraft({ project, user })
    const { documentVersion: doc } = await factories.createDocumentVersion({
      workspace,
      user,
      commit: commit1,
      path: 'folder1/doc1',
      content: factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'VERSION_1',
      }),
    })
    await mergeCommit(commit1).then((r) => r.unwrap())

    const { commit: commit2 } = await factories.createDraft({ project, user })
    await updateDocument({
      commit: commit2,
      document: doc,
      path: 'folder1/doc1',
      content: factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'VERSION_2',
      }),
    })
    await mergeCommit(commit2).then((r) => r.unwrap())

    const { commit: draft } = await factories.createDraft({ project, user })
    await updateDocument({
      commit: draft,
      document: doc,
      content: factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'VERSION_3',
      }),
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

    const result = await computeDocumentLogsWithMetadataQuery({
      workspaceId: project.workspaceId,
      documentUuid: doc.documentUuid,
      draft,
    })

    expect(result.find((l) => l.uuid === log1.uuid)).toBeDefined()
    expect(result.find((l) => l.uuid === log2.uuid)).toBeDefined()
    expect(result.find((l) => l.uuid === log3.uuid)).toBeDefined()
  })

  it('does not include logs from non-specified drafts', async () => {
    const { project, user, workspace, providers } =
      await factories.createProject()
    const { commit: commit1 } = await factories.createDraft({ project, user })
    const { documentVersion: doc } = await factories.createDocumentVersion({
      workspace,
      user,
      commit: commit1,
      path: 'folder1/doc1',
      content: factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'VERSION_1',
      }),
    })
    await mergeCommit(commit1).then((r) => r.unwrap())

    const { commit: draft1 } = await factories.createDraft({ project, user })
    await updateDocument({
      commit: draft1,
      document: doc,
      content: factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'VERSION_2',
      }),
    })

    const { commit: draft2 } = await factories.createDraft({ project, user })
    await updateDocument({
      commit: draft2,
      document: doc,
      content: factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'VERSION_3',
      }),
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

    const result = await computeDocumentLogsWithMetadataQuery({
      workspaceId: project.workspaceId,
      documentUuid: doc.documentUuid,
      draft: draft1,
    })

    expect(result.find((l) => l.uuid === log1.uuid)).toBeDefined()
    expect(result.find((l) => l.uuid === log2.uuid)).toBeDefined()
    expect(result.find((l) => l.uuid === log3.uuid)).not.toBeDefined()
  })

  it('returns a sum of tokens and cost', async () => {
    const { project, user, workspace, providers } =
      await factories.createProject()
    const { commit } = await factories.createDraft({ project, user })
    const { documentVersion: doc } = await factories.createDocumentVersion({
      workspace,
      user,
      commit,
      path: 'folder1/doc1',
      content: factories.helpers.createPrompt({
        provider: providers[0]!,
        content: '<response/>\n<response/>',
      }),
    })
    await mergeCommit(commit).then((r) => r.unwrap())

    const { documentLog: log } = await factories.createDocumentLog({
      document: doc,
      commit,
    })

    const result = await computeDocumentLogsWithMetadataQuery({
      workspaceId: project.workspaceId,
      documentUuid: doc.documentUuid,
      draft: commit,
    })

    expect(result.find((l) => l.uuid === log.uuid)).toBeDefined()
    expect(result.find((l) => l.uuid === log.uuid)?.tokens).toBeTypeOf('number')
    expect(
      result.find((l) => l.uuid === log.uuid)?.costInMillicents,
    ).toBeTypeOf('number')
  })
})
