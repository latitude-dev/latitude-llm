import { create } from 'zustand'
import { ResolvedMetadata } from '$/workers/readMetadata'
import {
  EvaluatedDocumentLog,
  LLM_EVALUATION_PROMPT_PARAMETERS,
} from '@latitude-data/core/constants'
import { Message, ToolMessage } from '@latitude-data/constants/legacyCompiler'
import { ExtractOutputResponse } from '$/app/api/evaluations/extract-output/route'

type ExtractedOutputSuccess = Extract<ExtractOutputResponse, { ok: true }>

export type LogInput = {
  value: string
  metadata: { includedInPrompt: boolean }
}
type EvaluatedLogParameters = {
  actualOutput: string
  conversation: Message[]
  tools: ToolMessage[]
  cost: number
  tokens: number
  duration: number
  prompt: string
  config: Record<string, unknown>
  parameters: Record<string, unknown>
}

function typedFilterObject<T extends object>(
  obj: T,
  keys: (keyof T)[],
): Partial<T> {
  return Object.keys(obj).reduce((acc, key) => {
    const typedKey = key as keyof T
    const value = obj[typedKey]
    if (keys.includes(typedKey) && value !== undefined && value !== null) {
      acc[typedKey] = value
    }
    return acc
  }, {} as Partial<T>)
}

function safeStringify(value: unknown): string {
  if (value === undefined || value === null) return ''

  try {
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return ''
  }
}

function serializeInputs(
  params: EvaluatedLogParameters,
  includedInPromptKeys: string[],
): Record<string, LogInput> {
  return Object.entries(params).reduce(
    (acc, [key, value]) => {
      acc[key] = {
        value: safeStringify(value),
        metadata: { includedInPrompt: includedInPromptKeys.includes(key) },
      }
      return acc
    },
    {} as Record<string, LogInput>,
  )
}

function safeParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

type ReturnDeserializedInputs = EvaluatedLogParameters & {
  expectedOutput: string
}
function deserializeInputs(
  inputs: Record<string, string>,
): ReturnDeserializedInputs {
  const result = {} as ReturnDeserializedInputs

  for (const [key, value] of Object.entries(inputs)) {
    switch (key) {
      case 'tokens':
      case 'duration':
      case 'cost':
        result[key] = Number(value)
        break

      case 'actualOutput':
      case 'expectedOutput':
      case 'prompt':
        result[key] = value
        break

      case 'config': {
        const config = safeParseJson<EvaluatedDocumentLog['config']>(value)
        if (!config) break
        result[key] = config as Record<string, unknown>
        break
      }
      case 'parameters': {
        const parsed = safeParseJson<EvaluatedDocumentLog['parameters']>(value)
        if (!parsed) break

        result[key] = parsed
        break
      }
      case 'conversation': {
        const parsed = safeParseJson<Message[]>(value)
        if (!parsed) break

        result[key] = parsed
        break
      }
    }
  }

  return result
}

const INITIAL_INPUTS = LLM_EVALUATION_PROMPT_PARAMETERS.reduce(
  (acc, key) => {
    acc[key] = {
      value: '',
      metadata: { includedInPrompt: false },
    }
    return acc
  },
  {} as Record<string, LogInput>,
)

type EvaluatedLogInputsState = {
  logsInitiallyLoaded: boolean
  inputs: Record<string, LogInput>
  parameters: EvaluatedLogParameters | undefined
  filteredParameters: Partial<EvaluatedLogParameters> | undefined
  metadataParameters: string[]
  expectedOutput: LogInput
  mapLogParametersToInputs: (data: ExtractedOutputSuccess) => void
  onMetadataChange: (metadata: ResolvedMetadata | undefined) => void
  setInputs: (inputs: Record<string, string>) => void
}

export const useEvaluatedLogInputs = create<EvaluatedLogInputsState>(
  (set, get) => ({
    logsInitiallyLoaded: false,
    inputs: INITIAL_INPUTS,
    expectedOutput: { value: '', metadata: { includedInPrompt: false } },
    parameters: {} as EvaluatedLogParameters,
    filteredParameters: {} as Partial<EvaluatedLogParameters>,
    metadataParameters: [],
    mapLogParametersToInputs: (data: ExtractedOutputSuccess) => {
      const { metadataParameters, expectedOutput } = get()
      const conversation = data.conversation as unknown as Message[]
      const parameters = {
        conversation,
        tokens: data.tokens,
        actualOutput: data.actualOutput,
        tools: conversation.filter((m) => m.role === 'tool'),
        cost: data.cost,
        duration: data.duration,
        prompt: data.prompt,
        config: data.config,
        parameters: data.parameters,
        expectedOutput: expectedOutput.value,
      }

      const inputs = serializeInputs(parameters, metadataParameters)

      set({
        parameters,
        filteredParameters: parameters,
        inputs,
        logsInitiallyLoaded: true,
      })
    },
    onMetadataChange: (metadata: ResolvedMetadata | undefined) => {
      if (!metadata) return

      const metadataParameters = Array.from(metadata.parameters)
      const { expectedOutput, parameters } = get()
      const params = parameters ?? ({} as EvaluatedLogParameters)
      const inputs = serializeInputs(params, metadataParameters)
      expectedOutput.metadata.includedInPrompt =
        metadataParameters.includes('expectedOutput')

      set({ metadataParameters, inputs })
    },
    setInputs: (allUpdatedInputs: Record<string, string>) => {
      const {
        parameters = {} as EvaluatedLogParameters,
        expectedOutput,
        inputs,
        metadataParameters,
      } = get()

      const { expectedOutput: updatedExpectedOutput, ...updatedInputs } =
        allUpdatedInputs
      const deserializedParameters = deserializeInputs(updatedInputs)

      const expectedOutputValue =
        updatedExpectedOutput !== undefined
          ? updatedExpectedOutput
          : expectedOutput.value

      deserializedParameters.expectedOutput
      const newParameters: Partial<EvaluatedLogParameters> = {
        ...parameters,
        ...deserializedParameters,
      }

      const newInputs: Record<string, LogInput> = {
        ...inputs,
        ...Object.keys(updatedInputs).reduce(
          (acc, key) => {
            acc[key] = {
              value: updatedInputs[key]!,
              metadata: {
                includedInPrompt: metadataParameters.includes(key),
              },
            }
            return acc
          },
          {} as Record<string, LogInput>,
        ),
      }

      const filteredParameters = typedFilterObject(
        { ...newParameters, expectedOutput: expectedOutputValue },
        metadataParameters as (keyof EvaluatedLogParameters)[],
      )

      set({
        parameters: newParameters as EvaluatedLogParameters,
        filteredParameters,
        inputs: newInputs,
        expectedOutput: {
          ...expectedOutput,
          value: expectedOutputValue,
        },
      })
    },
  }),
)
