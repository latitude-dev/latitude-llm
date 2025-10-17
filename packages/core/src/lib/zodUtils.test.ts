import { describe, expect, it } from 'vitest'
import { flattenErrors } from './zodUtils'
import { z } from 'zod'
import { type ZodSafeParseResult } from 'zod'

describe('flattenErrors', () => {
  let validation: ZodSafeParseResult<any>

  it('should flatten with only one layer of errors', async () => {
    const schema = z.object({
      name: z.string().min(1, 'Name is required'),
      email: z.string().email('Invalid email'),
    })

    const data = {
      name: '',
      email: 'invalid-email',
    }

    validation = await schema.safeParseAsync(data)
    if (!validation.success) {
      const result = flattenErrors(validation)
      expect(result).toEqual({
        name: ['Name is required'],
        email: ['Invalid email'],
      })
    }
  })

  it('should flatten with multiple layers of errors', async () => {
    const schema = z.object({
      age: z
        .number()
        .min(18, 'Must be 18 or older')
        .max(100, 'Must be 100 or younger')
        .int('Must be a whole number'),
      name: z
        .string()
        .min(1, 'Name is required')
        .max(10, 'Name must be short!!')
        .regex(/^[a-z]+$/, 'Name must contain only lowercase letters'),
    })

    const data = {
      age: 15.75,
      name: 'ESTERNOCLEIDOMASTOIDEO',
    }

    validation = await schema.safeParseAsync(data)
    if (!validation.success) {
      const result = flattenErrors(validation)
      expect(result).toEqual({
        name: [
          'Name must be short!!',
          'Name must contain only lowercase letters',
        ],
        age: ['Must be 18 or older', 'Must be a whole number'],
      })
    }
  })
})
