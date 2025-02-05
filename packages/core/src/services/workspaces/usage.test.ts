import { describe, expect, it, vi } from 'vitest'

import { WorkspaceDto } from '../../browser'
import { Providers } from '../../constants'
import { deleteCommitDraft } from '../commits'
import { connectEvaluations, destroyEvaluation } from '../evaluations'
import { computeWorkspaceUsage } from './usage'

describe('computeWorkspaceUsage', () => {
  it('calculates usage correctly when there are evaluation results and document logs', async (ctx) => {
    const {
      workspace: wsp,
      user,
      commit,
      documents,
      evaluations,
    } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'test' }],
      documents: {
        foo: ctx.factories.helpers.createPrompt({ provider: 'test' }),
      },
      evaluations: [
        { prompt: ctx.factories.helpers.createPrompt({ provider: 'test' }) },
      ],
    })

    const NUM_DOC_LOGS = 5
    const NUM_EVAL_LOGS = 5

    const document = documents[0]!
    const evaluation = evaluations[0]!
    const workspace = wsp as WorkspaceDto
    await connectEvaluations({
      user,
      workspace,
      documentUuid: document.documentUuid,
      evaluationUuids: [evaluation.uuid],
    })

    // Create document logs
    const documentLogs = await Promise.all(
      Array(NUM_DOC_LOGS)
        .fill(null)
        .map(() =>
          ctx.factories.createDocumentLog({
            document,
            commit,
          }),
        ),
    )

    const evaluationLogs = await Promise.all(
      Array(NUM_EVAL_LOGS)
        .fill(null)
        .map((_, idx) =>
          ctx.factories
            .createEvaluationResult({
              documentLog: documentLogs[idx % documentLogs.length]!.documentLog,
              evaluatedProviderLog:
                documentLogs[idx % documentLogs.length]!.providerLogs[0]!,
              evaluation,
            })
            .then((r) => r.evaluationResult),
        ),
    )

    const result = await computeWorkspaceUsage({
      id: workspace.id,
      currentSubscriptionCreatedAt: workspace.currentSubscription.createdAt,
      plan: workspace.currentSubscription.plan,
    }).then((r) => r.unwrap())

    expect(result.usage).toBe(documentLogs.length + evaluationLogs.length)
  })

  it('calculates usage correctly even if there are multiple workspaces with evaluation results and document logs', async (ctx) => {
    const {
      workspace: wsp1,
      documents: documents1,
      evaluations: evaluations1,
      commit: commit1,
    } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'test' }],
      documents: {
        foo: ctx.factories.helpers.createPrompt({ provider: 'test' }),
      },
      evaluations: [
        { prompt: ctx.factories.helpers.createPrompt({ provider: 'test' }) },
      ],
    })

    const workspace1 = wsp1 as WorkspaceDto
    const {
      workspace: workspace2,
      documents: documents2,
      evaluations: evaluations2,
      commit: commit2,
      user,
    } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'bar' }],
      documents: {
        bar: ctx.factories.helpers.createPrompt({ provider: 'bar' }),
      },
      evaluations: [
        {
          prompt: ctx.factories.helpers.createPrompt({ provider: 'bar' }),
        },
      ],
    })

    const NUM_DOC_LOGS = 5
    const NUM_EVAL_LOGS = 5

    const document1 = documents1[0]!
    const document2 = documents2[0]!
    const evaluation1 = evaluations1[0]!
    const evaluation2 = evaluations2[0]!

    await connectEvaluations({
      workspace: workspace1,
      user,
      documentUuid: document1.documentUuid,
      evaluationUuids: [evaluation1.uuid],
    })

    await connectEvaluations({
      workspace: workspace2,
      user,
      documentUuid: document2.documentUuid,
      evaluationUuids: [evaluation2.uuid],
    })

    // Create document logs
    const documentLogs1 = await Promise.all(
      Array(NUM_DOC_LOGS)
        .fill(null)
        .map(() =>
          ctx.factories.createDocumentLog({
            document: document1,
            commit: commit1,
          }),
        ),
    )

    const evaluationLogs1 = await Promise.all(
      Array(NUM_EVAL_LOGS)
        .fill(null)
        .map((_, idx) =>
          ctx.factories
            .createEvaluationResult({
              documentLog:
                documentLogs1[idx % documentLogs1.length]!.documentLog,
              evaluatedProviderLog:
                documentLogs1[idx % documentLogs1.length]!.providerLogs[0]!,
              evaluation: evaluations1[0]!,
            })
            .then((r) => r.evaluationResult),
        ),
    )

    const documentLogs2 = await Promise.all(
      Array(NUM_DOC_LOGS)
        .fill(null)
        .map(() =>
          ctx.factories.createDocumentLog({
            document: document2,
            commit: commit2,
          }),
        ),
    )

    await Promise.all(
      Array(NUM_EVAL_LOGS)
        .fill(null)
        .map((_, idx) =>
          ctx.factories
            .createEvaluationResult({
              documentLog:
                documentLogs2[idx % documentLogs2.length]!.documentLog,
              evaluatedProviderLog:
                documentLogs2[idx % documentLogs2.length]!.providerLogs[0]!,
              evaluation: evaluations2[0]!,
            })
            .then((r) => r.evaluationResult),
        ),
    )

    const result = await computeWorkspaceUsage({
      id: workspace1.id,
      currentSubscriptionCreatedAt: workspace1.currentSubscription.createdAt,
      plan: workspace1.currentSubscription.plan,
    }).then((r) => r.unwrap())

    expect(result.usage).toBe(documentLogs1.length + evaluationLogs1.length)
  })

  it('calculates usage correctly when there are no evaluation results or document logs', async (ctx) => {
    const {
      workspace: wsp,
      user,
      documents,
      evaluations,
    } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'test' }],
      documents: {
        foo: ctx.factories.helpers.createPrompt({ provider: 'test' }),
      },
      evaluations: [
        { prompt: ctx.factories.helpers.createPrompt({ provider: 'test' }) },
      ],
    })

    const workspace = wsp as WorkspaceDto
    const document = documents[0]!
    const evaluation = evaluations[0]!
    await connectEvaluations({
      workspace,
      user,
      documentUuid: document.documentUuid,
      evaluationUuids: [evaluation.uuid],
    })

    const result = await computeWorkspaceUsage({
      id: workspace.id,
      currentSubscriptionCreatedAt: workspace.currentSubscription.createdAt,
      plan: workspace.currentSubscription.plan,
    }).then((r) => r.unwrap())

    expect(result.usage).toBe(0)
  })

  it('calculates usage correctly across multiple projects within the workspace', async (ctx) => {
    const {
      workspace: wsp,
      user: user1,
      commit: commit1,
      documents: documents1,
      evaluations,
    } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'test' }],
      documents: {
        foo: ctx.factories.helpers.createPrompt({ provider: 'test' }),
      },
      evaluations: [
        { prompt: ctx.factories.helpers.createPrompt({ provider: 'test' }) },
      ],
    })

    const workspace = wsp as WorkspaceDto
    const {
      commit: commit2,
      documents: documents2,
      user: user2,
    } = await ctx.factories.createProject({
      workspace,
      documents: {
        bar: ctx.factories.helpers.createPrompt({ provider: 'test' }),
      },
    })

    const NUM_DOC_LOGS_PER_PROJECT = 5
    const NUM_EVAL_LOGS_PER_PROJECT = 5

    const evaluation = evaluations[0]!
    const document1 = documents1[0]!
    const document2 = documents2[0]!

    await connectEvaluations({
      workspace,
      user: user1,
      documentUuid: document1.documentUuid,
      evaluationUuids: [evaluation.uuid],
    })

    await connectEvaluations({
      workspace,
      user: user2,
      documentUuid: document2.documentUuid,
      evaluationUuids: [evaluation.uuid],
    })

    const document1Logs = await Promise.all(
      Array(NUM_DOC_LOGS_PER_PROJECT)
        .fill(null)
        .map(() =>
          ctx.factories.createDocumentLog({
            document: document1,
            commit: commit1,
          }),
        ),
    )

    const document2Logs = await Promise.all(
      Array(NUM_DOC_LOGS_PER_PROJECT)
        .fill(null)
        .map(() =>
          ctx.factories.createDocumentLog({
            document: document2,
            commit: commit2,
          }),
        ),
    )

    const evaluation1Logs = await Promise.all(
      Array(NUM_EVAL_LOGS_PER_PROJECT)
        .fill(null)
        .map((_, idx) =>
          ctx.factories
            .createEvaluationResult({
              documentLog:
                document1Logs[idx % document1Logs.length]!.documentLog,
              evaluatedProviderLog:
                document1Logs[idx % document1Logs.length]!.providerLogs[0]!,
              evaluation,
            })
            .then((r) => r.evaluationResult),
        ),
    )

    const evaluation2Logs = await Promise.all(
      Array(NUM_EVAL_LOGS_PER_PROJECT)
        .fill(null)
        .map((_, idx) =>
          ctx.factories
            .createEvaluationResult({
              documentLog:
                document2Logs[idx % document2Logs.length]!.documentLog,
              evaluatedProviderLog:
                document2Logs[idx % document2Logs.length]!.providerLogs[0]!,
              evaluation,
            })
            .then((r) => r.evaluationResult),
        ),
    )

    const documentLogs = [...document1Logs, ...document2Logs]
    const evaluationLogs = [...evaluation1Logs, ...evaluation2Logs]

    const result = await computeWorkspaceUsage({
      id: workspace.id,
      currentSubscriptionCreatedAt: workspace.currentSubscription.createdAt,
      plan: workspace.currentSubscription.plan,
    }).then((r) => r.unwrap())

    expect(result.usage).toBe(documentLogs.length + evaluationLogs.length)
  })

  it('takes logs from removed commits and evaluations into account', async (ctx) => {
    const {
      user,
      workspace: wsp,
      project,
      documents,
      evaluations,
    } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'test' }],
      documents: {
        foo: ctx.factories.helpers.createPrompt({ provider: 'test' }),
      },
      evaluations: [
        { prompt: ctx.factories.helpers.createPrompt({ provider: 'test' }) },
      ],
    })
    const workspace = wsp as WorkspaceDto

    const { commit: draft } = await ctx.factories.createDraft({ project, user })

    const NUM_DOC_LOGS = 5
    const NUM_EVAL_LOGS = 5

    const document = documents[0]!
    const evaluation = evaluations[0]!
    await connectEvaluations({
      user,
      workspace,
      documentUuid: document.documentUuid,
      evaluationUuids: [evaluation.uuid],
    })

    // Create document logs
    const documentLogs = await Promise.all(
      Array(NUM_DOC_LOGS)
        .fill(null)
        .map(() =>
          ctx.factories.createDocumentLog({
            document,
            commit: draft,
          }),
        ),
    )

    const evaluationLogs = await Promise.all(
      Array(NUM_EVAL_LOGS)
        .fill(null)
        .map((_, idx) =>
          ctx.factories
            .createEvaluationResult({
              documentLog: documentLogs[idx % documentLogs.length]!.documentLog,
              evaluatedProviderLog:
                documentLogs[idx % documentLogs.length]!.providerLogs[0]!,
              evaluation,
            })
            .then((r) => r.evaluationResult),
        ),
    )

    // Remove commit and evaluation
    await deleteCommitDraft(draft)
    await destroyEvaluation({ evaluation })

    const result = await computeWorkspaceUsage({
      id: workspace.id,
      currentSubscriptionCreatedAt: workspace.currentSubscription.createdAt,
      plan: workspace.currentSubscription.plan,
    }).then((r) => r.unwrap())

    expect(result.usage).toBe(documentLogs.length + evaluationLogs.length)
  })

  // FIXME: Probably this test can be removed. cc @geclos
  it.skip('only takes into account the runs since the last renewal', async (ctx) => {
    const today = new Date(2024, 9, 12)
    const createdAt = new Date(2023, 6, 3)
    vi.spyOn(Date, 'now').mockImplementation(() => today.getTime())

    const {
      workspace: wsp,
      commit,
      documents,
    } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'test' }],
      documents: {
        foo: ctx.factories.helpers.createPrompt({ provider: 'test' }),
      },
      workspace: {
        createdAt,
      },
    })
    const workspace = wsp as WorkspaceDto

    expect(workspace.createdAt).toEqual(createdAt)
    const document = documents[0]!

    const NUM_NOT_INCLUDED_DOC_LOGS = 5
    const NUM_INCLUDED_DOC_LOGS = 5

    // Workspace was created on 2023-06-03
    // Today is 2024-09-12, which means the last monthly renewal should be on 2024-09-12
    const expectedLastRenewalDate = new Date(2024, 9, 12)

    await Promise.all(
      Array(NUM_NOT_INCLUDED_DOC_LOGS)
        .fill(null)
        .map((idx) => {
          const dateBeforeLastRenewal = new Date(
            createdAt.getTime() +
              (expectedLastRenewalDate.getTime() - createdAt.getTime()) *
                (idx / (NUM_NOT_INCLUDED_DOC_LOGS - 1)),
          )
          return ctx.factories.createDocumentLog({
            document,
            commit,
            createdAt: dateBeforeLastRenewal,
          })
        }),
    )

    await Promise.all(
      Array(NUM_INCLUDED_DOC_LOGS)
        .fill(null)
        .map((idx) => {
          const dateAfterLastRenewal = new Date(
            expectedLastRenewalDate.getTime() +
              (today.getTime() - expectedLastRenewalDate.getTime()) *
                (idx / (NUM_INCLUDED_DOC_LOGS - 1)),
          )
          return ctx.factories.createDocumentLog({
            document,
            commit,
            createdAt: dateAfterLastRenewal,
          })
        }),
    )

    const result = await computeWorkspaceUsage({
      id: workspace.id,
      currentSubscriptionCreatedAt: workspace.currentSubscription.createdAt,
      plan: workspace.currentSubscription.plan,
    }).then((r) => r.unwrap())

    expect(result.usage).toBe(NUM_INCLUDED_DOC_LOGS)
  })
})
