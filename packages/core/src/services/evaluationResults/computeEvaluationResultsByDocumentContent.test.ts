import { describe, expect, it } from 'vitest'

import { computeEvaluationResultsByDocumentContent } from '.'
import { Commit, DocumentVersion, EvaluationDto } from '../../browser'
import { Providers } from '../../constants'
import * as factories from '../../tests/factories'
import { updateDocument } from '../documents'
import { connectEvaluations } from '../evaluations'

async function evaluateDocument({
  commit,
  document,
  evaluation,
  count,
}: {
  document: DocumentVersion
  commit: Commit
  evaluation: EvaluationDto
  count: number
}) {
  for (let i = 0; i < count; i++) {
    const { documentLog } = await factories.createDocumentLog({
      document,
      commit,
    })

    await factories.createEvaluationResult({
      documentLog,
      evaluation,
    })
  }
}

describe('computeEvaluationResultsByDocumentContent', () => {
  it('returns all ev results for a document created in a given commit', async () => {
    const { workspace, commit, documents, evaluations, user } =
      await factories.createProject({
        providers: [{ name: 'foo', type: Providers.OpenAI }],
        documents: {
          foo: factories.helpers.createPrompt({
            provider: 'foo',
          }),
        },
        evaluations: [
          {
            prompt: factories.helpers.createPrompt({
              provider: 'foo',
            }),
          },
        ],
      })

    const document = documents[0]!
    const evaluation = evaluations[0]!

    await connectEvaluations({
      workspace,
      documentUuid: document.documentUuid,
      evaluationUuids: [evaluation.uuid],
      user,
    })

    await evaluateDocument({
      document,
      commit,
      evaluation,
      count: 10,
    })

    const result = await computeEvaluationResultsByDocumentContent({
      evaluation,
      commit,
      documentUuid: document.documentUuid,
    })

    expect(result.ok).toBe(true)
  })

  it('evaluation results from previous commits if the document did not change', async () => {
    const { workspace, project, commit, documents, evaluations, user } =
      await factories.createProject({
        providers: [{ name: 'foo', type: Providers.OpenAI }],
        documents: {
          foo: factories.helpers.createPrompt({
            provider: 'foo',
            content: 'foo',
          }),
          bar: factories.helpers.createPrompt({
            provider: 'foo',
            content: 'bar',
          }),
        },
        evaluations: [
          {
            prompt: factories.helpers.createPrompt({
              provider: 'foo',
            }),
          },
        ],
      })

    const fooDocument = documents.find((d) => d.path === 'foo')!
    const barDocument = documents.find((d) => d.path === 'bar')!
    const evaluation = evaluations[0]!

    await connectEvaluations({
      workspace,
      documentUuid: fooDocument.documentUuid,
      evaluationUuids: [evaluation.uuid],
      user,
    })

    await evaluateDocument({
      document: fooDocument,
      commit,
      evaluation,
      count: 10,
    })

    const { commit: newCommit } = await factories.createDraft({
      project,
      user,
    })

    await updateDocument({
      commit: newCommit,
      document: barDocument,
      content: factories.helpers.createPrompt({
        provider: 'foo',
        content: 'barv2',
      }),
    })

    await evaluateDocument({
      document: fooDocument,
      commit: newCommit,
      evaluation,
      count: 15,
    })

    const result = await computeEvaluationResultsByDocumentContent({
      evaluation,
      commit: newCommit,
      documentUuid: fooDocument.documentUuid,
    })

    expect(result.ok).toBe(true)
    expect(result.value!.length).toBe(25)
  })

  it('does not include evaluation results from previous commits if the document changed', async () => {
    const { workspace, project, commit, documents, evaluations, user } =
      await factories.createProject({
        providers: [{ name: 'foo', type: Providers.OpenAI }],
        documents: {
          foo: factories.helpers.createPrompt({
            provider: 'foo',
            content: 'foo',
          }),
          bar: factories.helpers.createPrompt({
            provider: 'foo',
            content: 'bar',
          }),
        },
        evaluations: [
          {
            prompt: factories.helpers.createPrompt({
              provider: 'foo',
            }),
          },
        ],
      })

    const fooDocument = documents.find((d) => d.path === 'foo')!
    const evaluation = evaluations[0]!

    await connectEvaluations({
      workspace,
      documentUuid: fooDocument.documentUuid,
      evaluationUuids: [evaluation.uuid],
      user,
    })

    await evaluateDocument({
      document: fooDocument,
      commit,
      evaluation,
      count: 10,
    })

    const { commit: newCommit } = await factories.createDraft({
      project,
      user,
    })

    const newFooDocument = await updateDocument({
      commit: newCommit,
      document: fooDocument,
      content: factories.helpers.createPrompt({
        provider: 'foo',
        content: 'foov2',
      }),
    }).then((r) => r.unwrap())

    await evaluateDocument({
      document: newFooDocument,
      commit: newCommit,
      evaluation,
      count: 15,
    })

    const result = await computeEvaluationResultsByDocumentContent({
      evaluation,
      commit: newCommit,
      documentUuid: fooDocument.documentUuid,
    })

    expect(result.ok).toBe(true)
  })

  it('includes evaluation results from the same draft even if the document changed', async () => {
    const { workspace, project, evaluations, user } =
      await factories.createProject({
        providers: [{ name: 'foo', type: Providers.OpenAI }],
        evaluations: [
          {
            prompt: factories.helpers.createPrompt({
              provider: 'foo',
            }),
          },
        ],
      })

    const { commit: draft } = await factories.createDraft({ project, user })
    const evaluation = evaluations[0]!

    const { documentVersion: document } = await factories.createDocumentVersion(
      {
        commit: draft,
        path: 'foo',
        content: factories.helpers.createPrompt({
          provider: 'foo',
          content: 'foo',
        }),
        workspace,
        user,
      },
    )

    await connectEvaluations({
      workspace,
      documentUuid: document.documentUuid,
      evaluationUuids: [evaluation.uuid],
      user,
    })

    await evaluateDocument({
      document,
      commit: draft,
      evaluation,
      count: 10,
    })

    const newDocument = await updateDocument({
      commit: draft,
      document,
      content: factories.helpers.createPrompt({
        provider: 'foo',
        content: 'foov2',
      }),
    }).then((r) => r.unwrap())

    await evaluateDocument({
      document: newDocument,
      commit: draft,
      evaluation,
      count: 15,
    })

    const result = await computeEvaluationResultsByDocumentContent({
      evaluation,
      commit: draft,
      documentUuid: document.documentUuid,
    })

    expect(result.value!.length).toBe(25)
  })

  it('paginates the results correctly', async () => {
    const { workspace, commit, documents, evaluations, user } =
      await factories.createProject({
        providers: [{ name: 'foo', type: Providers.OpenAI }],
        documents: {
          foo: factories.helpers.createPrompt({
            provider: 'foo',
          }),
        },
        evaluations: [
          {
            prompt: factories.helpers.createPrompt({
              provider: 'foo',
            }),
          },
        ],
      })

    const document = documents[0]!
    const evaluation = evaluations[0]!

    await connectEvaluations({
      workspace,
      documentUuid: document.documentUuid,
      evaluationUuids: [evaluation.uuid],
      user,
    })

    await evaluateDocument({
      document,
      commit,
      evaluation,
      count: 10,
    })

    const result = await computeEvaluationResultsByDocumentContent({
      evaluation,
      commit,
      documentUuid: document.documentUuid,
    })

    expect(result.ok).toBe(true)

    const firstResult = await computeEvaluationResultsByDocumentContent({
      evaluation,
      commit,
      documentUuid: document.documentUuid,
      page: 1,
      pageSize: 1,
    })
    expect(firstResult.ok).toBe(true)
    expect(firstResult.value!.length).toBe(1)
    expect(firstResult.value![0]!.id).toBe(result.value![0]!.id)

    const secondResult = await computeEvaluationResultsByDocumentContent({
      evaluation,
      commit,
      documentUuid: document.documentUuid,
      page: 2,
      pageSize: 1,
    })
    expect(secondResult.ok).toBe(true)
    expect(secondResult.value!.length).toBe(1)
    expect(secondResult.value![0]!.id).toBe(result.value![1]!.id)
  })
})
