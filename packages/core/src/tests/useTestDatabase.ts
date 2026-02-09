import { testTransaction } from 'pg-transactional-tests'
import { afterAll, afterEach, beforeEach } from 'vitest'

export default function setupTestDatabase() {
  beforeEach(testTransaction.start)
  afterEach(testTransaction.rollback)
  afterAll(testTransaction.close)
}
