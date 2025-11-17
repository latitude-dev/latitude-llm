import { EvaluationType } from '../evaluations'

export enum IssueStatuses {
  merged = 'merged',
  regressed = 'regressed',
  resolved = 'resolved',
  ignored = 'ignored',
  escalating = 'escalating',
  new = 'new',
}

// TODO(AO): Put merged issues into archived status in all parts of the code
export const ISSUE_STATUS = {
  active: 'active', // not resolved, nor ignored, nor merged (but regressed yes)
  inactive: 'inactive', // resolved or ignored or merged
} as const

export const ISSUE_GROUP = {
  active: 'active', // not resolved, nor ignored, nor merged (but regressed yes)
  inactive: 'inactive', // resolved or ignored or merged
  activeWithResolved: 'activeWithResolved', // resolved and not ignored
}

export type IssueStatus = (typeof ISSUE_STATUS)[keyof typeof ISSUE_STATUS]
export type IssueGroup = (typeof ISSUE_GROUP)[keyof typeof ISSUE_GROUP]

export const ISSUE_SORTS = { relevance: 'relevance' } as const

export type IssueSort = (typeof ISSUE_SORTS)[keyof typeof ISSUE_SORTS]
export type SafeIssuesParams = {
  limit: number
  page: number
  sorting: {
    sort: IssueSort
    sortDirection: 'asc' | 'desc'
  }
  filters: {
    query?: string
    documentUuid?: string | null
    status?: IssueStatus
    firstSeen?: Date
    lastSeen?: Date
  }
}

export const ESCALATING_COUNT_THRESHOLD = 10
export const ESCALATING_DAYS = 2
export const NEW_ISSUES_DAYS = 7
export const RECENT_ISSUES_DAYS = 7
export const HISTOGRAM_SUBQUERY_ALIAS = 'histogramStats'
export const MINI_HISTOGRAM_STATS_DAYS = 90
export type QueryParams = { [key: string]: string | string[] | undefined }

export const DEFAULTS_ISSUE_PARAMS = {
  limit: 25,
  filters: {
    group: ISSUE_STATUS.active,
  },
  sorting: {
    sort: 'relevance' as const,
    sortDirection: 'desc' as const,
  },
}

export type IssueCentroid = {
  base: number[] // The running vector sum `S` of member contributions (already normalized + weighted + decayed). `S = Σ_i (w_source_i * decay_i * normalize(embedding_i))`
  weight: number // The running scalar `W = Σ_i (w_source_i * decay_i)`. Note, this is not the "number of evaluation results"
}

/* NOTE! DO NOT CHANGE these values before storing them on each result,
   otherwise centroids won't be able to be recomputed on removal!  */

// Weight marks the importance of the evaluation type on the issue centroid
export const ISSUE_EVALUATION_WEIGHTS: Record<EvaluationType, number> = {
  [EvaluationType.Human]: 1,
  [EvaluationType.Rule]: 0.8,
  [EvaluationType.Llm]: 0.6,
  [EvaluationType.Composite]: 0, // Note: composite evaluations cannot be used for issue discovery
}

// Half-life marks the importance of newer evaluation results on the issue centroid
export const ISSUE_HALF_LIFE = 14 * 24 * 60 * 60 * 1000 // 14 days

export const ISSUE_EMBEDDING_MODEL = 'voyage-3-large'
export const ISSUE_EMBEDDING_CACHE_KEY = (hash: string) =>
  `issues:embeddings:${hash}`

/* ---------------------------------------------------------- */

export type IssueCandidate = {
  uuid: string
  title: string
  description: string
  score: number
}

export const ISSUE_DISCOVERY_RERANK_MODEL = 'rerank-2.5'
export const ISSUE_DISCOVERY_RERANK_CACHE_KEY = (hash: string) =>
  `issues:reranks:${hash}`

export const ISSUE_DISCOVERY_SEARCH_RATIO = 0.75 // 75% vector search, 25% keyword search
export const ISSUE_DISCOVERY_MIN_SIMILARITY = 0.8 // 80% similarity (broader score)
export const ISSUE_DISCOVERY_MIN_KEYWORDS = 1 // At least 1 keyword match
export const ISSUE_DISCOVERY_MIN_RELEVANCE = 0.3 // 30% relevance (narrower score)
export const ISSUE_DISCOVERY_MAX_CANDIDATES = 20

export const ISSUE_GENERATION_RECENCY_RATIO = 0.8 // 80% more recent, 20% long-tail
export const ISSUE_GENERATION_RECENCY_DAYS = 7
export const ISSUE_GENERATION_MAX_RESULTS = 50
export const ISSUE_GENERATION_CACHE_KEY = (hash: string) =>
  `issues:generations:${hash}`

export const ISSUE_JOBS_MAX_ATTEMPTS = 3
export const ISSUE_JOBS_GENERATE_DETAILS_THROTTLE = 6 * 60 * 60 * 1000 // 6 hours
export const ISSUE_JOBS_MERGE_COMMON_THROTTLE = 24 * 60 * 60 * 1000 // 1 day
export const ISSUE_JOBS_DISCOVER_RESULT_DELAY = 60 * 1000 // 1 minute
