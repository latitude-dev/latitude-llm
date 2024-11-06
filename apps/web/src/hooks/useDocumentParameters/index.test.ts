import { describe, expect, it } from 'vitest'

import { recalculateInputs } from './index'

describe('recalculateInputs', () => {
  it('delete inputs not present in parameters', () => {
    const newInputs = recalculateInputs({
      inputs: {
        param1: 'value1',
        param2: 'value2',
      },
      metadataParameters: new Set(['param1']),
    })

    expect(newInputs).toEqual({ param1: 'value1' })
  })

  it('add new parameters with empty value', () => {
    const newInputs = recalculateInputs({
      inputs: {
        param1: 'value1',
      },
      metadataParameters: new Set(['param1', 'param2']),
    })

    expect(newInputs).toEqual({ param1: 'value1', param2: '' })
  })

  it('replace existing parameter if only one changed and keep value', () => {
    const newInputs = recalculateInputs({
      inputs: {
        param1: 'value1',
        param2: 'value2',
      },
      metadataParameters: new Set(['param1', 'param3']),
    })

    expect(newInputs).toEqual({ param1: 'value1', param3: 'value2' })
  })
})
