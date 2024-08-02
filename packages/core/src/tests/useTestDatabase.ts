import {
  close,
  patchPgForTransactions,
  rollbackTransaction,
  startTransaction,
  unpatchPgForTransactions,
} from 'pg-transactional-tests'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'

export default function useTestDatabase() {
  beforeAll(async () => {
    patchPgForTransactions()
  })
  beforeEach(startTransaction)
  afterEach(rollbackTransaction)
  afterAll(async () => {
    unpatchPgForTransactions()
    await close()
  })
}
