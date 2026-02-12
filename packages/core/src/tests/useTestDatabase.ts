import { testTransaction } from 'pg-transactional-tests'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import setupTestClickhouse from './useTestClickhouse'

export default function setupTestDatabase() {
  beforeAll(testTransaction.start)
  beforeEach(testTransaction.start)
  afterEach(testTransaction.rollback)
  afterAll(testTransaction.close)
  setupTestClickhouse()
}
