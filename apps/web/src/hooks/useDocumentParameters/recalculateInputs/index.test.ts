import { describe, expect, it } from 'vitest'

import { recalculateInputs } from './index'

describe('recalculateInputs', () => {
  it('delete inputs not present in parameters', () => {
    const newInputs = recalculateInputs({
      inputs: {
        param1: { value: 'value1', metadata: { includeInPrompt: true } },
        param2: { value: 'value2', metadata: { includeInPrompt: true } },
      },
      metadataParameters: new Set(['param1']),
    })

    expect(newInputs).toEqual({
      param1: {
        value: 'value1',
        metadata: {
          includeInPrompt: true,
        },
      },
    })
  })

  it('add new parameters with empty value', () => {
    const newInputs = recalculateInputs({
      inputs: {
        param1: { value: 'value1', metadata: { includeInPrompt: true } },
      },
      metadataParameters: new Set(['param1', 'param2']),
    })

    expect(newInputs).toEqual({
      param1: {
        value: 'value1',
        metadata: {
          includeInPrompt: true,
        },
      },
      param2: { value: '', metadata: { includeInPrompt: true } },
    })
  })

  it('respect metadata', () => {
    const newInputs = recalculateInputs({
      inputs: {
        param1: { value: 'value1', metadata: { includeInPrompt: false } },
      },
      metadataParameters: new Set(['param1']),
    })

    expect(newInputs).toEqual({
      param1: {
        value: 'value1',
        metadata: {
          includeInPrompt: false,
        },
      },
    })
  })

  it('replace existing parameter if only one changed and keep value', () => {
    const newInputs = recalculateInputs({
      inputs: {
        param1: { value: 'value1', metadata: { includeInPrompt: true } },
        param2: { value: 'value2', metadata: { includeInPrompt: true } },
      },
      metadataParameters: new Set(['param1', 'param3']),
    })

    expect(newInputs).toEqual({
      param1: {
        value: 'value1',
        metadata: {
          includeInPrompt: true,
        },
      },
      param3: { value: 'value2', metadata: { includeInPrompt: true } },
    })
  })
})
