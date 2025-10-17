import { LatteThreadCheckpoint } from '@latitude-data/core/schema/models/types/LatteThreadCheckpoint'

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
