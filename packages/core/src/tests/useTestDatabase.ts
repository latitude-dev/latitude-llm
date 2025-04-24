import { testTransaction } from 'pg-transactional-tests'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'

export default function setupTestDatabase() {
  beforeAll(testTransaction.start)
  beforeEach(testTransaction.start)
  afterEach(testTransaction.rollback)
  afterAll(testTransaction.close)
}
