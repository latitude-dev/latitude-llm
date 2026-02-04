import {
  EMPTY_USAGE,
  LanguageModelUsage,
  Message,
  OPTIMIZATION_SCORE_SCALE,
} from '../../../constants'
import { DatasetRow } from '../../../schema/models/types/DatasetRow'

export type Trajectory = {
  id: string // <workspace_id>::<dataset_id>::<row_id>
  trace: Message[] // BONUS(AO/OPT): To support multi-document optimization we need to use the whole trace including the sub-agents own trajectories
  usage: LanguageModelUsage
  duration: number
  score: number // Normalized score [0,1]
  feedback: string
  passed: boolean
  _tjr: boolean // Sentinel value to indicate that the result is of this type
}

export const LearnableTrajectory = (
  example: DatasetRow,
  {
    trace,
    usage,
    duration,
    score,
    feedback,
    passed,
  }: Omit<Partial<Trajectory>, 'id'>,
): Trajectory => ({
  id: TRAJECTORY_ID(example),
  trace: trace ?? [],
  usage: usage ?? EMPTY_USAGE(),
  duration: duration ?? 0,
  score: TRAJECTORY_SCORE(score ?? 0),
  feedback: feedback ?? '',
  passed: passed ?? false,
  _tjr: true,
})

export const TRAJECTORY_ID = (example: DatasetRow) =>
  `${example.workspaceId}::${example.datasetId}::${example.id}`

const TRAJECTORY_SCORE = (score: number) =>
  Math.min(
    Math.max((score / 100) * OPTIMIZATION_SCORE_SCALE, 0),
    OPTIMIZATION_SCORE_SCALE,
  )
