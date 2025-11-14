import {
  EvaluationResultV2,
  EvaluationV2,
  Providers,
  SpanType,
  SpanWithDetails,
} from '@latitude-data/constants'
import { addDays, format } from 'date-fns'
import { orderBy } from 'lodash-es'
import { type Commit } from '../../../schema/models/types/Commit'
import { type DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../../schema/models/types/Workspace'
import * as factories from '../../../tests/factories'
import { createMembership } from '../../memberships/create'
import { generateWorkspaceFixtures, type WorkspaceInfo } from './fixtures'
import { GetUsageOverview, GetUsageOverviewRow } from './getUsageOverview'

async function createMember({
  workspace,
  email,
  membershipCreatedAt,
}: {
  workspace: Workspace
  email: string
  membershipCreatedAt: Date
}) {
  const user = await factories.createUser({ email })
  await createMembership({
    workspace,
    user,
    createdAt: membershipCreatedAt,
  }).then((r) => r.unwrap())
  return user
}

async function createDocumentLog({
  commit,
  document,
  info,
  isFirst,
}: {
  commit: Commit
  document: DocumentVersion
  info: WorkspaceInfo['logs'][0]
  isFirst: boolean
}) {
  return await factories.createDocumentLog({
    commit,
    document,
    createdAt: info.createdAt,
    skipProviderLogs: !isFirst,
  })
}

async function createResultV2({
  evaluation,
  span,
  commit,
  workspace,
  info,
}: {
  evaluation: EvaluationV2
  span: SpanWithDetails<SpanType.Prompt>
  commit: Commit
  workspace: Workspace
  info: WorkspaceInfo['resultsV2'][0]
}) {
  return await factories.createEvaluationResultV2({
    evaluation: evaluation,
    span: span,
    commit: commit,
    workspace: workspace,
    createdAt: info.createdAt,
  })
}

async function createWorkspace(workspaceInfo: WorkspaceInfo) {
  const creator = await factories.createUser({
    email: `admin@${workspaceInfo.name}.com`,
  })
  const { workspace } = await factories.createWorkspace({
    name: workspaceInfo.name,
    creator,
    createdAt: workspaceInfo.subscription.createdAt,
    subscriptionPlan: workspaceInfo.subscription.plan,
  })

  // Members
  const remainderMembers = await Promise.all(
    workspaceInfo.memberEmails.map((email, i) =>
      createMember({
        workspace,
        email,
        membershipCreatedAt: addDays(creator.createdAt, i + 1),
      }),
    ),
  )

  const { commit, documents, project } = await factories.createProject({
    workspace,
    providers: [{ type: Providers.OpenAI, name: 'test' }],
    documents: {
      foo: factories.helpers.createPrompt({ provider: 'test' }),
    },
  })

  const document = documents[0]!

  const documentLogs = await Promise.all(
    workspaceInfo.logs.map(async (info, index) => {
      const { documentLog, providerLogs } = await createDocumentLog({
        commit,
        document,
        info,
        isFirst: index === 0,
      })
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        documentLogUuid: documentLog.uuid,
        type: SpanType.Prompt,
        commitUuid: commit.uuid,
        createdAt: documentLog.createdAt,
      })

      return { documentLog, span, providerLogs }
    }),
  )
  let evaluationResultsV2: EvaluationResultV2[] = []

  const log = documentLogs[0]!
  if (log) {
    const { span } = log

    evaluationResultsV2 = await Promise.all(
      workspaceInfo.resultsV2.map(async (info) => {
        const evaluation = await factories.createEvaluationV2({
          document: document,
          commit: commit,
          workspace: workspace,
        })

        return await createResultV2({
          evaluation: evaluation,
          span: span as unknown as SpanWithDetails<SpanType.Prompt>,
          commit: commit,
          workspace: workspace,
          info: info,
        })
      }),
    )
  }

  return {
    originalInfo: workspaceInfo,
    workspace,
    subcription: workspace.currentSubscription,
    projectId: project.id,
    documentLogs,
    evaluationResultsV2,
    membersCount: workspaceInfo.memberEmails.length + 1,
    emails: orderBy([creator, ...remainderMembers], (u) => u.createdAt, 'desc')
      .map((u) => u.email)
      .join(', '),
  }
}

// @ts-ignore
type ExpectedRowData = Omit<GetUsageOverviewRow, 'id', 'currentMonthRuns'> & {
  id: string
}
async function createWorkspaces({
  workspacesInfo,
}: {
  workspacesInfo: WorkspaceInfo[]
}) {
  const list = await Promise.all(workspacesInfo.map(createWorkspace))
  return list.reduce<Record<string, ExpectedRowData>>((acc, w) => {
    const name = w.workspace.name.replace('overview__', '')
    acc[name] = {
      expectedData: {
        workspaceId: w.workspace.id,
        name,
        subscriptionPlan: w.subcription.plan,
        subscriptionCreatedAt: format(
          w.subcription.createdAt,
          'yyyy-MM-dd HH:mm:ss',
        ),
        numOfMembers: w.membersCount.toString(),
        emails: w.emails,
      },
      info: {
        fixture: w.originalInfo,
        logs: w.documentLogs,
        evaluationResultsV2: w.evaluationResultsV2,
      },
    }
    return acc
  }, {}) as Record<string, ExpectedRowData>
}

export async function buildAllData(targetDate: Date) {
  const workspaceFixtures = generateWorkspaceFixtures(targetDate)
  const workspaces = await createWorkspaces({
    workspacesInfo: Object.values(workspaceFixtures),
  })
  return { targetDate, workspaces }
}

/**
 * FIXME: this is a hack to get only workspaces with
 * overview__ prefix.
 * This is done because our tests don't rollback the database
 * after each test, so we need to filter out the workspaces
 * that were created by old tests.
 *
 * Maybe is only when tests fail and I see a lot of crap in my
 * test database.
 */
export function onlyOverviewWorkspaces(data: GetUsageOverview) {
  return data
    .filter((d) => d.name?.startsWith('overview__', 0))
    .map((d) => ({
      ...d,
      name: d.name?.replace('overview__', ''),
    }))
}
