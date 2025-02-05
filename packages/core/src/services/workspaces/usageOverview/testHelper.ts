import { EvaluationResultDto, Providers } from '@latitude-data/constants'
import { orderBy } from 'lodash-es'
import { format } from 'date-fns'
import * as factories from '../../../tests/factories'
import { createMembership } from '../../memberships/create'
import { generateWorkspaceFixtures, type WorkspaceInfo } from './fixtures'
import {
  Workspace,
  Commit,
  DocumentVersion,
  Evaluation,
  DocumentLog,
  ProviderLog,
  EvaluationDto,
} from '../../../browser'
import { connectEvaluations } from '../../evaluations'
import { GetUsageOverview, GetUsageOverviewRow } from './getUsageOverview'

async function createMember(workspace: Workspace) {
  const user = await factories.createUser()
  await createMembership({ workspace, user }).then((r) => r.unwrap())
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

async function createResult({
  evaluation,
  documentLog,
  evaluatedProviderLog,
  info,
}: {
  evaluation: Evaluation
  documentLog: DocumentLog
  evaluatedProviderLog: ProviderLog
  info: WorkspaceInfo['results'][0]
}) {
  return await factories
    .createEvaluationResult({
      documentLog,
      evaluatedProviderLog,
      evaluation: evaluation as EvaluationDto,
      evaluationResultCreatedAt: info.createdAt,
    })
    .then((r) => r.evaluationResult)
}
async function createWorkspace(workspaceInfo: WorkspaceInfo) {
  const creator = await factories.createUser()
  const remainingMembers = workspaceInfo.numberOfMembers - 1
  const { workspace } = await factories.createWorkspace({
    name: workspaceInfo.name,
    creator,
    createdAt: workspaceInfo.subscription.createdAt,
    subscriptionPlan: workspaceInfo.subscription.plan,
  })

  // Members
  const remainderMembers = await Promise.all(
    Array.from({ length: remainingMembers }, () => createMember(workspace)),
  )

  // Project and evaluation
  const { commit, documents, evaluations, project } =
    await factories.createProject({
      workspace,
      providers: [{ type: Providers.OpenAI, name: 'test' }],
      documents: {
        foo: factories.helpers.createPrompt({ provider: 'test' }),
      },
      evaluations: [
        { prompt: factories.helpers.createPrompt({ provider: 'test' }) },
      ],
    })

  const document = documents[0]!
  const evaluation = evaluations[0]!
  await connectEvaluations({
    user: creator,
    workspace,
    documentUuid: document.documentUuid,
    evaluationUuids: [evaluation.uuid],
  })

  const documentLogs = await Promise.all(
    workspaceInfo.logs.map((info, index) =>
      createDocumentLog({ commit, document, info, isFirst: index === 0 }),
    ),
  )
  let evaluationResults: EvaluationResultDto[] = []

  const log = documentLogs[0]!

  if (log) {
    const { documentLog, providerLogs } = log
    const evaluatedProviderLog = providerLogs[0]!
    evaluationResults = await Promise.all(
      workspaceInfo.results.map((info) =>
        createResult({ evaluation, documentLog, evaluatedProviderLog, info }),
      ),
    )
  }

  return {
    originalInfo: workspaceInfo,
    workspace,
    subcription: workspace.currentSubscription,
    projectId: project.id,
    documentLogs,
    evaluationResults,
    membersCount: workspaceInfo.numberOfMembers,
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
        evaluationResults: w.evaluationResults,
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
