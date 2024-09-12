import { beforeEach, describe, expect, it } from 'vitest'

import { ConnectedEvaluationsRepository } from '.'
import {
  Commit,
  DocumentVersion,
  EvaluationDto,
  Project,
  User,
  Workspace,
} from '../../browser'
import { Providers } from '../../constants'
import { mergeCommit } from '../../services/commits'
import { createNewDocument, updateDocument } from '../../services/documents'
import { destroyOrSoftDeleteDocuments } from '../../services/documents/destroyOrSoftDeleteDocuments'
import { connectEvaluations } from '../../services/evaluations'
import * as factories from '../../tests/factories'

function documentContent(text: string) {
  return `
---
provider: openai
model: foo
---
${text}
`
}

async function generateDocumentLogs({
  document,
  commit,
  parameters,
  quantity = 1,
}: {
  document: DocumentVersion
  commit: Commit
  parameters?: Record<string, unknown>
  quantity?: number
}) {
  return await Promise.all(
    Array.from({ length: quantity }).map(async () => {
      return factories
        .createDocumentLog({
          document,
          commit,
          parameters,
        })
        .then((r) => r.documentLog)
    }),
  )
}

describe('getConnectedDocumentsWithMetadata', () => {
  let user: User
  let workspace: Workspace
  let project: Project
  let commit: Commit
  let documents: DocumentVersion[]
  let evaluation: EvaluationDto

  const connectEvaluationToDocuments = async ({
    documents: documentsArr,
  }: { documents?: DocumentVersion[] } = {}) => {
    await Promise.all(
      (documentsArr ?? documents).map(async (document) => {
        await connectEvaluations({
          workspace,
          documentUuid: document.documentUuid,
          evaluationUuids: [evaluation.uuid],
        })
      }),
    )
  }

  beforeEach(async () => {
    const projectData = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        translate: documentContent('Translate the following text: {{text}}'),
        summarize: documentContent('Summarize the following text: {{text}}'),
        poet: documentContent(
          'Write a poem based in the following text: {{text}}',
        ),
      },
      evaluations: [
        {
          name: 'Instruction',
          prompt: documentContent(
            'Did the assistant follow the instructions correctly? ...',
          ),
        },
      ],
    })

    ;({ user, workspace, project, commit, documents } = projectData)

    evaluation = projectData.evaluations[0]!
  })

  it('returns an empty list when the evaluation is not connected to any document', async () => {
    const connectedEvaluationsScope = new ConnectedEvaluationsRepository(
      workspace.id,
    )
    const result = await connectedEvaluationsScope
      .getConnectedDocumentsWithMetadata(evaluation.id)
      .then((r) => r.unwrap())

    expect(result).toEqual([])
  })

  it('returns a list with all of the documents that are connected to the evaluation', async () => {
    await connectEvaluationToDocuments()

    const connectedEvaluationsScope = new ConnectedEvaluationsRepository(
      workspace.id,
    )
    const result = await connectedEvaluationsScope
      .getConnectedDocumentsWithMetadata(evaluation.id)
      .then((r) => r.unwrap())

    expect(result.length).toEqual(documents.length)
    const expectedDocumentUuids = documents.map((d) => d.documentUuid).sort()
    const resultDocumentUuids = result.map((r) => r.documentUuid).sort()

    expect(resultDocumentUuids).toEqual(expectedDocumentUuids)
  })

  it('returns only one item per document, independently of the number of versions for each document', async () => {
    const { commit: draft1 } = await factories.createDraft({ project, user })
    await updateDocument({
      commit: draft1,
      document: documents[0]!,
      content: documentContent('Version 2'),
    })
    await mergeCommit(draft1)

    const { commit: draft2 } = await factories.createDraft({ project, user })
    await updateDocument({
      commit: draft2,
      document: documents[0]!,
      content: documentContent('Version 3'),
    })
    await mergeCommit(draft2)
    await connectEvaluationToDocuments()

    const connectedEvaluationsScope = new ConnectedEvaluationsRepository(
      workspace.id,
    )
    const result = await connectedEvaluationsScope
      .getConnectedDocumentsWithMetadata(evaluation.id)
      .then((r) => r.unwrap())

    expect(result.length).toEqual(documents.length)
    const expectedDocumentUuids = documents.map((d) => d.documentUuid).sort()
    const resultDocumentUuids = result.map((r) => r.documentUuid).sort()

    expect(resultDocumentUuids).toEqual(expectedDocumentUuids)
  })

  it('does not return documents that only exist in a draft, even when its connected to an evaluation', async () => {
    const { commit: draft } = await factories.createDraft({ project, user })
    const draftDocument = await createNewDocument({
      commit: draft,
      path: 'foo',
      content: documentContent('New document'),
    }).then((r) => r.unwrap())

    await connectEvaluationToDocuments({ documents: [draftDocument] })

    const connectedEvaluationsScope = new ConnectedEvaluationsRepository(
      workspace.id,
    )
    const result = await connectedEvaluationsScope
      .getConnectedDocumentsWithMetadata(evaluation.id)
      .then((r) => r.unwrap())

    expect(result.length).toEqual(0)

    await mergeCommit(draft)

    const result2 = await connectedEvaluationsScope
      .getConnectedDocumentsWithMetadata(evaluation.id)
      .then((r) => r.unwrap())

    expect(result2.length).toEqual(1)
  })

  it('does not return removed documents', async () => {
    await connectEvaluationToDocuments()

    const { commit: draft } = await factories.createDraft({ project, user })
    await destroyOrSoftDeleteDocuments({
      documents: [documents[0]!],
      commit: draft,
    })
    await mergeCommit(draft)

    const connectedEvaluationsScope = new ConnectedEvaluationsRepository(
      workspace.id,
    )
    const result = await connectedEvaluationsScope
      .getConnectedDocumentsWithMetadata(evaluation.id)
      .then((r) => r.unwrap())

    expect(result.length).toEqual(2) // 3 documents, 1 removed
    expect(
      result.filter((r) => r.documentUuid === documents[0]!.documentUuid)
        .length,
    ).toEqual(0)
  })

  it('returns the correct metadata for each connected document', async () => {
    await connectEvaluationToDocuments({ documents: [documents[0]!] })

    const logs = await generateDocumentLogs({
      document: documents[0]!,
      commit,
      parameters: { text: 'foo' },
      quantity: 5,
    })
    const results = await Promise.all(
      logs.map((documentLog) => {
        return factories.createEvaluationResult({
          evaluation,
          documentLog,
        })
      }),
    )

    const totalTokens = results.reduce(
      (acc, r) => acc + r.providerLogs.reduce((acc2, l) => acc2 + l.tokens, 0),
      0,
    )
    const totalCost = results.reduce(
      (acc, r) =>
        acc +
        r.providerLogs.reduce((acc2, l) => acc2 + l.cost_in_millicents, 0),
      0,
    )

    const connectedEvaluationsScope = new ConnectedEvaluationsRepository(
      workspace.id,
    )
    const result = await connectedEvaluationsScope
      .getConnectedDocumentsWithMetadata(evaluation.id)
      .then((r) => r.unwrap())

    expect(result.length).toEqual(1)
    const resultItem = result[0]!
    expect(resultItem.documentUuid).toEqual(documents[0]!.documentUuid)
    expect(resultItem.evaluationLogs).toEqual(logs.length)
    expect(resultItem.totalTokens).toEqual(totalTokens)
    expect(resultItem.costInMillicents).toEqual(totalCost)
  })

  it('correctly calculates the modal value', async () => {
    await connectEvaluationToDocuments({ documents: [documents[0]!] })

    const logs = await generateDocumentLogs({
      document: documents[0]!,
      commit,
      parameters: { text: 'foo' },
      quantity: 10,
    })
    await Promise.all(
      logs.map((documentLog, index) => {
        return factories.createEvaluationResult({
          evaluation,
          documentLog,
          result: index < 6 ? 'yes' : 'no', // yes should appear 6 times, while no should appear 4 times
        })
      }),
    )

    const connectedEvaluationsScope = new ConnectedEvaluationsRepository(
      workspace.id,
    )
    const result = await connectedEvaluationsScope
      .getConnectedDocumentsWithMetadata(evaluation.id)
      .then((r) => r.unwrap())

    expect(result.length).toEqual(1)
    const resultItem = result[0]!
    expect(resultItem.documentUuid).toEqual(documents[0]!.documentUuid)
    expect(resultItem.evaluationLogs).toEqual(logs.length)
    expect(resultItem.modalValue).toEqual('yes')
    expect(resultItem.modalValueCount).toEqual(6)
  })

  it('returns 0 in metadata when there are no evaluation results', async () => {
    await connectEvaluationToDocuments({ documents: [documents[0]!] })

    const connectedEvaluationsScope = new ConnectedEvaluationsRepository(
      workspace.id,
    )
    const result = await connectedEvaluationsScope
      .getConnectedDocumentsWithMetadata(evaluation.id)
      .then((r) => r.unwrap())

    expect(result.length).toEqual(1)
    const resultItem = result[0]!
    expect(resultItem.documentUuid).toEqual(documents[0]!.documentUuid)
    expect(resultItem.evaluationLogs).toEqual(0)
    expect(resultItem.totalTokens).toEqual(0)
    expect(resultItem.costInMillicents).toEqual(0)
    expect(resultItem.modalValue).toEqual(null)
    expect(resultItem.modalValueCount).toEqual(0)
  })
})
