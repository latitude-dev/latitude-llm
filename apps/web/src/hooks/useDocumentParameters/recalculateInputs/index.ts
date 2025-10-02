import { ParameterType } from '@latitude-data/constants'
import { ResolvedMetadata } from '$/workers/readMetadata'
import {
  Inputs,
  InputSource,
} from '@latitude-data/core/lib/documentPersistedInputs'

const ParameterTypes = Object.values(ParameterType) as string[]

export function recalculateInputs<S extends InputSource>({
  inputs,
  fallbackInputs,
  metadata: prompt,
}: {
  inputs: Inputs<S>
  fallbackInputs?: Inputs<S>
  metadata: ResolvedMetadata
}): Inputs<S> {
  const config = (prompt.config.parameters || {}) as Record<
    string,
    { type?: string }
  >

  // We assume users can't never change the parameter
  // more than once. So when a parameter is renamed it means
  // it's the old one. We pick the first
  const firstChangedInput = Object.entries(inputs).find(
    ([key]) => !prompt.parameters.has(key),
  )?.[1]

  return Object.fromEntries(
    Array.from(prompt.parameters).map((param) => {
      const input =
        inputs[param] ?? fallbackInputs?.[param] ?? firstChangedInput
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
