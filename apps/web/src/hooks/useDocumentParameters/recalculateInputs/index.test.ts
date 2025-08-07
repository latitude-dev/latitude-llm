import type { ResolvedMetadata } from '$/workers/readMetadata'
import { describe, expect, it } from 'vitest'

import { recalculateInputs } from './index'
import { ParameterType } from '@latitude-data/constants'

describe('recalculateInputs', () => {
  it('delete inputs not present in parameters', () => {
    const newInputs = recalculateInputs({
      inputs: {
        param1: {
          value: 'value1',
          metadata: { includeInPrompt: true, type: ParameterType.File },
        },
        param2: { value: 'value2', metadata: { includeInPrompt: true } },
      },
      metadata: {
        parameters: new Set(['param1']),
        config: {
          parameters: {
            param1: {
              type: ParameterType.Text,
            },
            param2: {
              type: ParameterType.File,
            },
          },
        },
      } as unknown as ResolvedMetadata,
    })

    expect(newInputs).toEqual({
      param1: {
        value: 'value1',
        metadata: {
          includeInPrompt: true,
          type: ParameterType.Text,
        },
      },
    })
  })

  it('add new parameters with empty value', () => {
    const newInputs = recalculateInputs({
      inputs: {
        param1: { value: 'value1', metadata: { includeInPrompt: true } },
      },
      metadata: {
        parameters: new Set(['param1', 'param2']),
        config: {
          parameters: {
            param2: {
              type: ParameterType.File,
            },
          },
        },
      } as unknown as ResolvedMetadata,
    })

    expect(newInputs).toEqual({
      param1: {
        value: 'value1',
        metadata: {
          includeInPrompt: true,
        },
      },
      param2: {
        value: '',
        metadata: { includeInPrompt: true, type: ParameterType.File },
      },
    })
  })

  it('respect metadata', () => {
    const newInputs = recalculateInputs({
      inputs: {
        param1: {
          value: 'value1',
          metadata: {
            includeInPrompt: false,
            type: ParameterType.Image,
          },
        },
      },
      metadata: {
        parameters: new Set(['param1']),
        config: {},
      } as unknown as ResolvedMetadata,
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

  it('replace existing parameter if only one changed and keeps value', () => {
    const newInputs = recalculateInputs({
      inputs: {
        param1: { value: 'value1', metadata: { includeInPrompt: true } },
        param2: {
          value: 'value2',
          metadata: { includeInPrompt: true, type: ParameterType.File },
        },
      },
      metadata: {
        parameters: new Set(['param1', 'param3']),
        config: {
          parameters: {
            param3: {
              type: ParameterType.Image,
            },
          },
        },
      } as unknown as ResolvedMetadata,
    })

    expect(newInputs).toEqual({
      param1: {
        value: 'value1',
        metadata: {
          includeInPrompt: true,
        },
      },
      param3: {
        value: 'value2',
        metadata: { includeInPrompt: true, type: ParameterType.Image },
      },
    })
  })

  it('adds parameter metadata', () => {
    const newInputs = recalculateInputs({
      inputs: {
        param1: {
          value: 'value1',
          metadata: {},
        },
      },
      metadata: {
        parameters: new Set(['param1']),
        config: {
          parameters: {
            param1: {
              type: ParameterType.Text,
            },
          },
        },
      } as unknown as ResolvedMetadata,
    })

    expect(newInputs).toEqual({
      param1: {
        value: 'value1',
        metadata: {
          includeInPrompt: true,
          type: ParameterType.Text,
        },
      },
    })
  })

  it('replaces parameter metadata', () => {
    const newInputs = recalculateInputs({
      inputs: {
        param1: {
          value: 'value1',
          metadata: {
            type: ParameterType.Text,
          },
        },
      },
      metadata: {
        parameters: new Set(['param1']),
        config: {
          parameters: {
            param1: {
              type: ParameterType.Image,
            },
          },
        },
      } as unknown as ResolvedMetadata,
    })

    expect(newInputs).toEqual({
      param1: {
        value: 'value1',
        metadata: {
          includeInPrompt: true,
          type: ParameterType.Image,
        },
      },
    })
  })

  it('removes parameter metadata', () => {
    const newInputs = recalculateInputs({
      inputs: {
        param1: {
          value: 'value1',
          metadata: {
            type: ParameterType.Text,
          },
        },
      },
      metadata: {
        parameters: new Set(['param1']),
        config: {},
      } as unknown as ResolvedMetadata,
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

  it('ignores unknown parameter type', () => {
    const newInputs = recalculateInputs({
      inputs: {
        param1: {
          value: 'value1',
          metadata: {
            type: ParameterType.File,
          },
        },
      },
      metadata: {
        parameters: new Set(['param1']),
        config: {
          parameters: {
            param1: {
              type: 'unknown',
            },
          },
        },
      } as unknown as ResolvedMetadata,
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
})
