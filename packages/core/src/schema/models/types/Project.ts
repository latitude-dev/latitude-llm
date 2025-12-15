import { type InferSelectModel } from 'drizzle-orm'

import { projects } from '../projects'
import { ActiveRun, CompletedRun } from '@latitude-data/constants'

export type Project = InferSelectModel<typeof projects>

export type ProjectRuns = {
  active: ActiveRun[]
  completed: CompletedRun[]
}
