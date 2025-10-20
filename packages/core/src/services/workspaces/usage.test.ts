import { Providers } from '@latitude-data/constants'
import { describe, expect, it, vi } from 'vitest'
import { type WorkspaceDto } from '../../schema/models/types/Workspace'
import { deleteCommitDraft } from '../commits'
import { deleteEvaluationV2 } from '../evaluationsV2/delete'
import { computeWorkspaceUsage } from './usage'

describe('computeWorkspaceUsage', () => {
  it('calculates usage correctly when there are evaluation results and document logs', async (ctx) => {
    const {
      workspace: wsp,
      commit,
      documents,
    } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'test' }],
      documents: {
        foo: ctx.factories.helpers.createPrompt({ provider: 'test' }),
      },
    })

    const NUM_DOC_LOGS = 5
    const NUM_EVAL_LOGS = 5

    const document = documents[0]!
    const workspace = wsp as WorkspaceDto
    const evaluationV2 = await ctx.factories.createEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
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

    const evaluationResultsV2 = await Promise.all(
      Array(NUM_EVAL_LOGS)
        .fill(null)
        .map((_, idx) =>
          ctx.factories.createEvaluationResultV2({
            evaluation: evaluationV2,
            providerLog:
              documentLogs[idx % documentLogs.length]!.providerLogs[0]!,
            commit: commit,
            workspace: workspace,
          }),
        ),
    )

    const result = await computeWorkspaceUsage({
      id: workspace.id,
      currentSubscriptionCreatedAt: workspace.currentSubscription.createdAt,
      plan: workspace.currentSubscription.plan,
    }).then((r) => r.unwrap())

    expect(result.usage).toBe(documentLogs.length + evaluationResultsV2.length)
  })

  it('calculates usage correctly even if there are multiple workspaces with evaluation results and document logs', async (ctx) => {
    const {
      workspace: wsp1,
      documents: documents1,
      commit: commit1,
    } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'test' }],
      documents: {
        foo: ctx.factories.helpers.createPrompt({ provider: 'test' }),
      },
    })

    const workspace1 = wsp1 as WorkspaceDto
    const {
      workspace: workspace2,
      documents: documents2,
      commit: commit2,
    } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'bar' }],
      documents: {
        bar: ctx.factories.helpers.createPrompt({ provider: 'bar' }),
      },
    })

    const NUM_DOC_LOGS = 5
    const NUM_EVAL_LOGS = 5

    const document1 = documents1[0]!
    const document2 = documents2[0]!
    const evaluationV21 = await ctx.factories.createEvaluationV2({
      document: document1,
      commit: commit1,
      workspace: workspace1,
    })
    const evaluationV22 = await ctx.factories.createEvaluationV2({
      document: document2,
      commit: commit2,
      workspace: workspace2,
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

    const evaluationResultsV21 = await Promise.all(
      Array(NUM_EVAL_LOGS)
        .fill(null)
        .map((_, idx) =>
          ctx.factories.createEvaluationResultV2({
            evaluation: evaluationV21,
            providerLog:
              documentLogs1[idx % documentLogs1.length]!.providerLogs[0]!,
            commit: commit1,
            workspace: workspace1,
          }),
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
          ctx.factories.createEvaluationResultV2({
            evaluation: evaluationV22,
            providerLog:
              documentLogs2[idx % documentLogs2.length]!.providerLogs[0]!,
            commit: commit2,
            workspace: workspace2,
          }),
        ),
    )

    const result = await computeWorkspaceUsage({
      id: workspace1.id,
      currentSubscriptionCreatedAt: workspace1.currentSubscription.createdAt,
      plan: workspace1.currentSubscription.plan,
    }).then((r) => r.unwrap())

    expect(result.usage).toBe(
      documentLogs1.length + evaluationResultsV21.length,
    )
  })

  it('calculates usage correctly when there are no evaluation results or document logs', async (ctx) => {
    const {
      workspace: wsp,
      commit,
      documents,
    } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'test' }],
      documents: {
        foo: ctx.factories.helpers.createPrompt({ provider: 'test' }),
      },
    })

    const workspace = wsp as WorkspaceDto
    const document = documents[0]!
    await ctx.factories.createEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
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
      commit: commit1,
      documents: documents1,
    } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'test' }],
      documents: {
        foo: ctx.factories.helpers.createPrompt({ provider: 'test' }),
      },
    })

    const workspace = wsp as WorkspaceDto
    const { commit: commit2, documents: documents2 } =
      await ctx.factories.createProject({
        workspace,
        documents: {
          bar: ctx.factories.helpers.createPrompt({ provider: 'test' }),
        },
      })

    const NUM_DOC_LOGS_PER_PROJECT = 5
    const NUM_EVAL_LOGS_PER_PROJECT = 5

    const document1 = documents1[0]!
    const document2 = documents2[0]!
    const evaluationV21 = await ctx.factories.createEvaluationV2({
      document: document1,
      commit: commit1,
      workspace: workspace,
    })
    const evaluationV22 = await ctx.factories.createEvaluationV2({
      document: document2,
      commit: commit2,
      workspace: workspace,
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

    const evaluationResultsV21 = await Promise.all(
      Array(NUM_EVAL_LOGS_PER_PROJECT)
        .fill(null)
        .map((_, idx) =>
          ctx.factories.createEvaluationResultV2({
            evaluation: evaluationV21,
            providerLog:
              document1Logs[idx % document1Logs.length]!.providerLogs[0]!,
            commit: commit1,
            workspace: workspace,
          }),
        ),
    )

    const evaluationResultsV22 = await Promise.all(
      Array(NUM_EVAL_LOGS_PER_PROJECT)
        .fill(null)
        .map((_, idx) =>
          ctx.factories.createEvaluationResultV2({
            evaluation: evaluationV22,
            providerLog:
              document2Logs[idx % document2Logs.length]!.providerLogs[0]!,
            commit: commit2,
            workspace: workspace,
          }),
        ),
    )

    const documentLogs = [...document1Logs, ...document2Logs]
    const evaluationResultsV2 = [
      ...evaluationResultsV21,
      ...evaluationResultsV22,
    ]
    const result = await computeWorkspaceUsage({
      id: workspace.id,
      currentSubscriptionCreatedAt: workspace.currentSubscription.createdAt,
      plan: workspace.currentSubscription.plan,
    }).then((r) => r.unwrap())

    expect(result.usage).toBe(documentLogs.length + evaluationResultsV2.length)
  })

  it('takes logs from removed commits and evaluations into account', async (ctx) => {
    const {
      user,
      workspace: wsp,
      project,
      documents,
    } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'test' }],
      documents: {
        foo: ctx.factories.helpers.createPrompt({ provider: 'test' }),
      },
    })
    const workspace = wsp as WorkspaceDto

    const { commit: draft } = await ctx.factories.createDraft({ project, user })

    const NUM_DOC_LOGS = 5
    const NUM_EVAL_LOGS = 5

    const document = documents[0]!
    const evaluationV2 = await ctx.factories.createEvaluationV2({
      document: document,
      commit: draft,
      workspace: workspace,
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

    const evaluationResultsV2 = await Promise.all(
      Array(NUM_EVAL_LOGS)
        .fill(null)
        .map((_, idx) =>
          ctx.factories.createEvaluationResultV2({
            evaluation: evaluationV2,
            providerLog:
              documentLogs[idx % documentLogs.length]!.providerLogs[0]!,
            commit: draft,
            workspace: workspace,
          }),
        ),
    )

    // Remove commit, document, and evaluation
    await ctx.factories.destroyDocumentVersion({
      document: document,
      commit: draft,
      workspace: workspace,
    })
    await deleteEvaluationV2({
      evaluation: evaluationV2,
      commit: draft,
      workspace: workspace,
    }).then((r) => r.unwrap())
    await deleteCommitDraft(draft)

    const result = await computeWorkspaceUsage({
      id: workspace.id,
      currentSubscriptionCreatedAt: workspace.currentSubscription.createdAt,
      plan: workspace.currentSubscription.plan,
    }).then((r) => r.unwrap())

    expect(result.usage).toBe(documentLogs.length + evaluationResultsV2.length)
  })

  it('only takes into account the runs since the last renewal', async (ctx) => {
    const today = new Date(2024, 9, 12)
    const lastRenewalDate = new Date(2024, 8, 12)
    const dateBeforeRenewal = new Date(2024, 7, 1)
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
        createdAt: lastRenewalDate,
      },
    })
    const workspace = wsp as WorkspaceDto
    const document = documents[0]!

    await ctx.factories.createDocumentLog({
      document,
      commit,
      createdAt: dateBeforeRenewal,
    })

    const currentPeriodLog = await ctx.factories.createDocumentLog({
      document,
      commit,
      createdAt: today,
    })

    const result = await computeWorkspaceUsage({
      id: workspace.id,
      currentSubscriptionCreatedAt: workspace.currentSubscription.createdAt,
      plan: workspace.currentSubscription.plan,
    }).then((r) => r.unwrap())

    expect(result.usage).toBe(1)
    expect(currentPeriodLog).toBeDefined()
  })
})
