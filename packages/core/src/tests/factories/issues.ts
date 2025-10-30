import { faker } from '@faker-js/faker'
import { type Workspace } from '../../schema/models/types/Workspace'
import { type Project } from '../../schema/models/types/Project'
import { createIssue as createIssueService } from '../../services/issues/create'
import {
  createIssueHistogramsBulk,
  type IssueHistogramData,
} from '../../services/issueHistograms/createBulk'
import { createWorkspace, type ICreateWorkspace } from './workspaces'
import { createProject, type ICreateProject } from './projects'
import { IssueHistogram } from '../../schema/models/types/IssueHistogram'

export type ICreateIssue = {
  createAt: Date
  workspace?: Workspace | ICreateWorkspace
  project?: Project | ICreateProject
  documentUuid?: string
  title?: string
  description?: string
  histograms?: IssueHistogramData[]
}

export async function createIssue(issueData: Partial<ICreateIssue> = {}) {
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

  const documentUuid = issueData.documentUuid ?? faker.string.uuid()
  const title = issueData.title ?? faker.lorem.sentence()
  const description = issueData.description ?? faker.lorem.paragraph()

  const result = await createIssueService({
    workspace,
    project,
    documentUuid,
    title,
    description,
    createdAt: issueData.createAt,
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
    histograms,
  }
}
