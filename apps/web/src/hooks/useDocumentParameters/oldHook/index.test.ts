import { describe, expect, it } from 'vitest'

import { recalculateInputs } from './index'

describe('recalculateInputs', () => {
  it('delete inputs not present in parameters', () => {
    const newInputs = recalculateInputs({
      inputs: {
        param1: { value: 'value1', includedInPrompt: true },
        param2: { value: 'value2', includedInPrompt: true },
      },
      metadataParameters: new Set(['param1']),
      newParams: true,
    })

    expect(newInputs).toEqual({
      param1: {
        value: 'value1',
        includedInPrompt: true,
      },
    })
  })

  it('add new parameters with empty value', () => {
    const newInputs = recalculateInputs({
      inputs: {
        param1: { value: 'value1', includedInPrompt: true },
      },
      metadataParameters: new Set(['param1', 'param2']),
      newParams: true,
    })

    expect(newInputs).toEqual({
      param1: {
        value: 'value1',
        includedInPrompt: true,
      },
      param2: { value: '', includedInPrompt: true },
    })
  })

  it('replace existing parameter if only one changed and keep value', () => {
    const newInputs = recalculateInputs({
      inputs: {
        param1: { value: 'value1', includedInPrompt: true },
        param2: { value: 'value2', includedInPrompt: true },
      },
      metadataParameters: new Set(['param1', 'param3']),
      newParams: true,
    })

    expect(newInputs).toEqual({
      param1: {
        value: 'value1',
        includedInPrompt: true,
      },
      param3: { value: 'value2', includedInPrompt: true },
    })
  })

  // TODO: Remove when feature flag for new params is off
  describe('when newParams is false', () => {
    it('delete inputs not present in parameters', () => {
      const newInputs = recalculateInputs({
        inputs: {
          param1: 'value1',
          param2: 'value2',
        },
        metadataParameters: new Set(['param1']),
        newParams: false,
      })

      expect(newInputs).toEqual({ param1: 'value1' })
    })
  })
})
