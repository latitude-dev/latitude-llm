import { Inputs, InputSource } from '$/hooks/useDocumentParameters'

export function recalculateInputs<S extends InputSource>({
  inputs,
  metadataParameters,
}: {
  inputs: Inputs<S>
  metadataParameters: Set<string>
}): Inputs<S> {
  return Object.fromEntries(
    Array.from(metadataParameters).map((param) => {
      if (param in inputs) {
        const value = inputs[param]?.value ?? ''
        const includeInPrompt = inputs[param]?.metadata.includeInPrompt ?? true
        return [param, { value, metadata: { includeInPrompt } }]
      }

      const availableInputKey = Object.keys(inputs).find(
        (key) => !metadataParameters.has(key),
      )

      if (availableInputKey) {
        const input = inputs[availableInputKey]
        const value = input?.value ?? ''
        const includeInPrompt = input?.metadata.includeInPrompt ?? true
        return [param, { value, metadata: { includeInPrompt } }]
      }

      return [param, { value: '', metadata: { includeInPrompt: true } }]
    }),
  )
}
