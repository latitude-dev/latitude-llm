import { LatteThreadCheckpoint } from '@latitude-data/core/browser'

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
