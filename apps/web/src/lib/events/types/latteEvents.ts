import { LatteThreadCheckpoint } from '@latitude-data/core/schema/types'

export interface LatteEvents {
  LatteChangesAccepted: {
    threadUuid: string
    checkpoints: LatteThreadCheckpoint[]
  }
  LatteChangesRejected: {
    threadUuid: string
    checkpoints: LatteThreadCheckpoint[]
  }
}
