import { type InferSelectModel } from 'drizzle-orm'

import { projects } from '../projects'
import { ActiveRun, CompletedRun } from '@latitude-data/constants'

export type Project = InferSelectModel<typeof projects>
export interface ProjectStats {
  totalTokens: number
  totalRuns: number
  totalDocuments: number
  runsPerModel: Record<string, number>
  costPerModel: Record<string, number>
  rollingDocumentLogs: Array<{ date: string; count: number }>
  totalEvaluations: number
  totalEvaluationResults: number
  costPerEvaluation: Record<string, number>
}

export type ProjectLimitedView = ProjectStats

export type ProjectRuns = {
  active: ActiveRun[]
  completed: CompletedRun[]
}
