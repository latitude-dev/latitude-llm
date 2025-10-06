import type { LatteEvents } from './latteEvents'
import type { DocumentEvents } from './documentEvents'
import type { CommitEvents } from './commitEvents'

export type Events = LatteEvents & DocumentEvents & CommitEvents
