import { describe, it } from 'vitest'

import { EvaluationsRepository } from './evaluationsRepository'

describe('mock', () => {
  it('test', async () => {
    const evaluationsRepo = new EvaluationsRepository(1)

    const allEvals = await evaluationsRepo.findAll()
    console.log(allEvals)
  })
})
