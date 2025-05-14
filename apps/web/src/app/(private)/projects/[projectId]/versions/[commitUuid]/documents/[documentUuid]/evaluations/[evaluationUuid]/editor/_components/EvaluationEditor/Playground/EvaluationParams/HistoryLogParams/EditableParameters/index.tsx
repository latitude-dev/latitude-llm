import {
  DocumentVersion,
  EvaluationType,
  EvaluationV2,
  LLM_EVALUATION_PROMPT_PARAMETERS,
  LlmEvaluationMetricAnyCustom,
  LlmEvaluationPromptParameter,
} from '@latitude-data/core/browser'
import { ICommitContextType } from '@latitude-data/web-ui/providers'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { useEvaluationParameters } from '../../../../hooks/useEvaluationParamaters'
import { PlainTextParameterInput } from '../PlainTextParameterInput'
import { EditableJsonInput } from '../EditableJsonInput'

const JSON_FIELDS = [
  'config',
  'toolCalls',
  'messages',
  'parameters',
] as const satisfies readonly LlmEvaluationPromptParameter[]
type JsonField = (typeof JSON_FIELDS)[number]

function isJsonField(param: LlmEvaluationPromptParameter): param is JsonField {
  return (JSON_FIELDS as readonly string[]).includes(param)
}

export function EditableParameters({
  document,
  commit,
  evaluation,
  isLoading,
}: {
  commit: ICommitContextType['commit']
  isLoading: boolean
  document: DocumentVersion
  evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetricAnyCustom>
}) {
  const specification = getEvaluationMetricSpecification(evaluation)
  const {
    history: { inputs, setInputs, expectedOutput },
  } = useEvaluationParameters({
    commitVersionUuid: commit.uuid,
    document,
    evaluation,
  })

  return (
    <div className='grid grid-cols-[auto_1fr] gap-y-3'>
      {/* TODO: This UI has to be different when requires expected output */}
      {/* It will have a Dataset selector and in the run create a documentLog and evaluates it */}
      {specification.requiresExpectedOutput ? (
        <PlainTextParameterInput
          input={expectedOutput}
          param='expectedOutput'
          setInputs={setInputs}
          isLoading={isLoading}
          placeholder='Put here the expected output to compare with'
          minRows={3}
        />
      ) : null}
      {LLM_EVALUATION_PROMPT_PARAMETERS.map((param, idx) => {
        if (isJsonField(param)) {
          return (
            <EditableJsonInput
              key={idx}
              param={param}
              input={inputs[param]}
              setInputs={setInputs}
            />
          )
        }
        return (
          <PlainTextParameterInput
            key={idx}
            input={inputs[param]}
            param={param}
            setInputs={setInputs}
            isLoading={isLoading}
          />
        )
      })}
    </div>
  )
}
