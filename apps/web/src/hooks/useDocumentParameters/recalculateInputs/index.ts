import { Inputs, InputSource, ParameterType } from '@latitude-data/core/browser'
import type { ConversationMetadata } from 'promptl-ai'

const ParameterTypes = Object.values(ParameterType) as string[]

export function recalculateInputs<S extends InputSource>({
  inputs,
  metadata: prompt,
}: {
  inputs: Inputs<S>
  metadata: ConversationMetadata
}): Inputs<S> {
  const config = (prompt.config.parameters || {}) as Record<
    string,
    { type?: string }
  >

  const firstChangedInput = Object.entries(inputs).find(
    ([key]) => !prompt.parameters.has(key),
  )?.[1]

  return Object.fromEntries(
    Array.from(prompt.parameters).map((param) => {
      const input = inputs[param] || firstChangedInput
      let type = config[param]?.type
      if (type && !ParameterTypes.includes(type)) {
        type = undefined
      }

      if (input) {
        return [
          param,
          {
            ...input,
            metadata: {
              ...input.metadata,
              includeInPrompt: input.metadata.includeInPrompt ?? true,
              ...config[param],
              type: type,
            },
          },
        ]
      }

      return [
        param,
        {
          value: '',
          metadata: {
            includeInPrompt: true,
            ...config[param],
            type: type,
          },
        },
      ]
    }),
  )
}
