import { describe, expect, test, vi } from 'vitest'

import { database } from '../client'
import Transaction from './Transaction'
import { Result } from './Result'

describe('Transaction deadlock retry', () => {
  test('retries when a DB transaction fails with SQLSTATE 40P01', async () => {
    const tx = new Transaction()

    let attempts = 0

    const transactionSpy = vi
      .spyOn(database, 'transaction')
      .mockImplementationOnce(async (cb: any) => {
        // Run the callback, then simulate a deadlock happening during the transaction.
        await cb({})
        const err = new Error('deadlock detected') as Error & { code: string }
        err.code = '40P01'
        throw err
      })
      .mockImplementationOnce(async (cb: any) => {
        // Second attempt succeeds.
        await cb({})
      })

    const result = await tx.call(async () => {
      attempts++
      return Result.ok('ok')
    })

    expect(result.ok).toBe(true)
    expect(result.value).toBe('ok')
    expect(attempts).toBe(2)

    transactionSpy.mockRestore()
  })
})
