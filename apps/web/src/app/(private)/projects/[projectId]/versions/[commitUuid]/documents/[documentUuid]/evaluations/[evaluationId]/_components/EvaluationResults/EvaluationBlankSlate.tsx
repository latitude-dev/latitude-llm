'use client'

import { useState } from 'react'

import {
  EvaluationDto,
  EvaluationMetadataType,
} from '@latitude-data/core/browser'
import {
  CodeBlock,
  TableBlankSlate,
  TabSelector,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import useApiKeys from '$/stores/apiKeys'

export function EvaluationBlankSlate({
  evaluation,
  onOpen,
}: {
  evaluation: EvaluationDto
  onOpen: () => void
}) {
  if (evaluation.metadataType === EvaluationMetadataType.Manual) {
    return (
      <TableBlankSlate
        description="There are no evaluation results yet. Submit the first evaluation result using Latitude's SDK or HTTP API."
        link={<SubmitEvaluationDocumentation evaluation={evaluation} />}
      />
    )
  }

  return (
    <TableBlankSlate
      description='There are no evaluation results yet. Run the evaluation or, if you already have, wait a few seconds for the first results to stream in.'
      link={
        <TableBlankSlate.Button onClick={onOpen}>
          Run the evaluation
        </TableBlankSlate.Button>
      }
    />
  )
}

function SubmitEvaluationDocumentation({
  evaluation,
}: {
  evaluation: EvaluationDto
}) {
  const [selected, setSelected] = useState<'http' | 'sdk'>('sdk')

  return (
    <div className='flex flex-col mt-4 gap-4 items-center'>
      <TabSelector
        options={[
          { label: 'Javascript / Typescript', value: 'sdk' },
          { label: 'HTTP API', value: 'http' },
        ]}
        selected={selected}
        onSelect={setSelected}
      />
      {selected === 'sdk' && <SdkDocumentation evaluation={evaluation} />}
      {selected === 'http' && <HttpDocumentation evaluation={evaluation} />}
    </div>
  )
}

function SdkDocumentation({ evaluation }: { evaluation: EvaluationDto }) {
  const document = useCurrentDocument()
  const { project } = useCurrentProject()
  const { data: apiKeys } = useApiKeys()
  const apiKey = apiKeys?.[0]?.token

  const sdkCode = `import { Latitude } from '@latitude-data/sdk'

// Do not expose the API key in client-side code
const sdk = new Latitude('${apiKey ?? 'YOUR_API_KEY'}', { projectId: ${project.id} })

// A conversation with an LLM
const messages = [{ role: 'user', content: 'Tell me a joke about turtles' }, { role: 'assistant', content: 'A joke about turtles' }]

// Submit your log to Latitude
const { uuid } = sdk.logs.create('${document.path}', messages)

// Report evaluation result for the log
const result = await sdk.evaluations.createResult(uuid, '${evaluation.uuid}', {
  result: 5,
  reason: 'The reason for the result', // Optional
})
`

  return (
    <div className='max-w-2xl'>
      <CodeBlock language='typescript'>{sdkCode}</CodeBlock>
    </div>
  )
}

function HttpDocumentation({ evaluation }: { evaluation: EvaluationDto }) {
  const { data: apiKeys } = useApiKeys()
  const apiKey = apiKeys?.[0]?.token
  const getRequestBodyContent = () => {
    const body = {
      result: 5,
      reason: 'The reason for the result (optional)',
    } as Record<string, unknown>

    return JSON.stringify(body, null, 2)
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n')
  }

  const apiCode = `
curl -X POST \\
  https://gateway.latitude.so/api/v2/conversations/<LOG_UUID>/evaluations/${evaluation.uuid}/results \\
  -H 'Authorization: Bearer ${apiKey ?? 'YOUR_API_KEY'}' \\
  -H 'Content-Type: application/json' \\
  -d '
${getRequestBodyContent()}
  '
`

  return (
    <div className='max-w-2xl'>
      <CodeBlock language='bash'>{apiCode.trim()}</CodeBlock>
    </div>
  )
}
