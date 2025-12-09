import { format } from 'date-fns'
import { faker } from '@faker-js/faker'
import { type Workspace } from '../../schema/models/types/Workspace'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { createIssue as createIssueService } from '../../services/issues/create'
import { createWorkspace, type ICreateWorkspace } from './workspaces'
import { createProject, type ICreateProject } from './projects'
import { IssueHistogram } from '../../schema/models/types/IssueHistogram'
import { type Issue } from '../../schema/models/types/Issue'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issueHistograms } from '../../schema/models/issueHistograms'

export type IssueHistogramData = {
  commitId: number
  date: Date
  count: number
}

async function createIssueHistogramsBulk(
  {
    workspace,
    histograms,
  }: {
    workspace: Workspace
    histograms: (IssueHistogramData & { issue: Issue })[]
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const values = histograms.map(({ issue, commitId, date, count }) => ({
      workspaceId: workspace.id,
      projectId: issue.projectId,
      documentUuid: issue.documentUuid,
      issueId: issue.id,
      commitId,
      date: format(date, 'yyyy-MM-dd'),
      count,
    }))

    const results = await tx.insert(issueHistograms).values(values).returning()

    return Result.ok(results)
  })
}

export type ICreateIssue = {
  createdAt: Date
  escalatingAt?: Date | null
  document: DocumentVersion
  workspace?: Workspace | ICreateWorkspace
  project?: Project | ICreateProject
  title?: string
  description?: string
  histograms?: IssueHistogramData[]
}

export async function createIssue(issueData: Partial<ICreateIssue> = {}) {
  if (!issueData.document) {
    throw new Error('DocumentVersion is required to create an Issue')
  }

  const workspaceData = issueData.workspace ?? {}
  let workspace: Workspace
  let project: Project

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

  const title = issueData.title ?? faker.lorem.sentence()
  const description = issueData.description ?? faker.lorem.paragraph()

  const result = await createIssueService({
    workspace,
    project,
    document: issueData.document,
    title,
    description,
    createdAt: issueData.createdAt,
    escalatingAt: issueData.escalatingAt,
  })

  const issue = result.unwrap().issue
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
    histograms,
  }
}
