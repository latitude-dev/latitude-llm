import { faker } from '@faker-js/faker'
import { type Workspace } from '../../schema/models/types/Workspace'
import { type Project } from '../../schema/models/types/Project'
import { type Commit } from '../../schema/models/types/Commit'
import { EvaluationResultV2 } from '../../constants'
import { createIssue as createIssueService } from '../../services/issues/create'
import {
  createIssueHistogramsBulk,
  type IssueHistogramData,
} from '../../services/issueHistograms/createBulk'
import { createWorkspace, type ICreateWorkspace } from './workspaces'
import { createProject, type ICreateProject } from './projects'
import { createDraft } from './commits'
import { createUser } from './users'
import { IssueHistogram } from '../../schema/models/types/IssueHistogram'
import { User } from '../../schema/models/types/User'

export type ICreateIssue = {
  workspace?: Workspace | ICreateWorkspace
  project?: Project | ICreateProject
  commit?: Commit
  documentUuid?: string
  title?: string
  description?: string
  firstSeenResult?: EvaluationResultV2
  firstSeenAt?: Date
  lastSeenResult?: EvaluationResultV2
  lastSeenAt?: Date
  histograms?: IssueHistogramData[]
}

export async function createIssue(issueData: Partial<ICreateIssue> = {}) {
  const workspaceData = issueData.workspace ?? {}
  let workspace: Workspace
  let project: Project
  let commit: Commit

  if ('id' in workspaceData) {
    workspace = workspaceData as Workspace
  } else {
    const newWorkspace = await createWorkspace(workspaceData)
    workspace = newWorkspace.workspace
  }

  const projectData = issueData.project ?? {}
  if ('id' in projectData) {
    project = projectData as Project
  } else {
    const newProject = await createProject({ workspace, ...projectData })
    project = newProject.project
  }

  if (issueData.commit) {
    commit = issueData.commit
  } else {
    // Get user from workspace or create a default one
    const user = workspace.creatorId
      ? ({ id: workspace.creatorId } as User)
      : await createUser()
    const newCommit = await createDraft({ project, user })
    commit = newCommit.commit
  }

  const documentUuid = issueData.documentUuid ?? faker.string.uuid()
  const title = issueData.title ?? faker.lorem.sentence()
  const description = issueData.description ?? faker.lorem.paragraph()
  const firstSeenAt = issueData.firstSeenAt ?? faker.date.past()
  const lastSeenAt = issueData.lastSeenAt ?? faker.date.recent()

  const result = await createIssueService({
    workspace,
    project,
    commit,
    documentUuid,
    title,
    description,
    firstSeenResult: issueData.firstSeenResult,
    firstSeenAt,
    lastSeenResult: issueData.lastSeenResult,
    lastSeenAt,
  })

  const issue = result.unwrap()
  let histograms: IssueHistogram[] = []

  // Create histograms if provided
  if (issueData.histograms && issueData.histograms.length > 0) {
    const histogramResult = await createIssueHistogramsBulk({
      workspace,
      histograms: issueData.histograms.map((histogram) => ({
        ...histogram,
        issue,
      })),
    })

    if (histogramResult.error) {
      throw histogramResult.error
    }
    histograms = histogramResult.value
  }

  return {
    issue,
    workspace,
    project,
    commit,
    histograms,
  }
}
