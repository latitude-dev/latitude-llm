import { NotificiationsLayoutProps } from '../../types'

export type TopProjectLog = {
  projectId: number
  projectName: string
  logsCount: number
  tokensSpent: number
  tokensCost: number
}
export type LogStats = {
  usedInProduction: boolean
  logsCount: number
  tokensSpent: number
  tokensCost: number
  topProjects: TopProjectLog[]
}

export type TopProjectAnnotation = {
  projectId: number
  projectName: string
  annotationsCount: number
  passedCount: number
  failedCount: number
  passedPercentage: number
  failedPercentage: number
}

export type AnnotationStats = {
  hasAnnotations: boolean
  annotationsCount: number
  passedCount: number
  failedCount: number
  passedPercentage: number
  failedPercentage: number
  topProjects: TopProjectAnnotation[]
  firstProjectId: number | null
}

export type TopProjectIssue = {
  projectId: number
  projectName: string
  issuesCount: number
  newIssuesCount: number
  escalatedIssuesCount: number
  resolvedIssuesCount: number
  ignoredIssuesCount: number
  regressedIssuesCount: number
}

export type NewIssue = {
  id: number
  title: string
  projectId: number
  commitUuid: string
}
export type IssueStats = {
  hasIssues: boolean
  issuesCount: number
  newIssuesCount: number
  escalatedIssuesCount: number
  resolvedIssuesCount: number
  ignoredIssuesCount: number
  regressedIssuesCount: number
  topProjects: TopProjectIssue[]
  newIssuesList: NewIssue[]
}

export type WeeklyEmailMailProps = {
  currentWorkspace: NotificiationsLayoutProps['currentWorkspace']
  logs: LogStats
  issues: IssueStats
  annotations: AnnotationStats
}
