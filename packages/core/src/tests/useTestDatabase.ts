import { testTransaction } from 'pg-transactional-tests'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'

export default function useTestDatabase() {
  beforeAll(testTransaction.start)
  beforeEach(testTransaction.start)
  afterEach(testTransaction.rollback)
  afterAll(testTransaction.close)
}
