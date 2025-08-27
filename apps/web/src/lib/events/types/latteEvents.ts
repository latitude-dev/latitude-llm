import { LatteChange } from '@latitude-data/constants/latte'

export interface LatteEvents {
  LatteProjectChanges: { changes: LatteChange[] }
  LatteChangesAccepted: { changes: LatteChange[] }
  LatteChangesRejected: { changes: LatteChange[] }
}
