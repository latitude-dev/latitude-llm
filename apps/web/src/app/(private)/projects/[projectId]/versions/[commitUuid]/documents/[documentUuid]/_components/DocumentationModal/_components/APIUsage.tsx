import { CodeBlock, Text } from '@latitude-data/web-ui'

export function APIUsage({
  projectId,
  commitUuid,
  documentPath,
  apiKey,
  parameters,
}: {
  projectId: number
  commitUuid: string
  documentPath: string
  apiKey: string | undefined
  parameters: Set<string>
}) {
  const getRequestBodyContent = () => {
    const bodyContent = [`    "path": "${documentPath}"`]

    if (parameters.size > 0) {
      const parameterEntries = Array.from(parameters)
        .map((key) => `      "${key}": ""`)
        .join(',\n')

      bodyContent.push(`    "parameters": {
${parameterEntries}
    }`)
    }

    return bodyContent.join(',\n')
  }

  const apiCode = `
curl -X POST \\
  https://gateway.latitude.so/api/v1/projects/${projectId}/versions/${commitUuid}/documents/run \\
  -H 'Authorization: Bearer ${apiKey ?? 'YOUR_API_KEY'}' \\
  -H 'Content-Type: application/json' \\
  -d '{
${getRequestBodyContent()}
  }'
`

  return (
    <div className='flex flex-col gap-4'>
      <Text.H5>You can use the Latitude API to run this document:</Text.H5>
      <CodeBlock language='bash'>{apiCode.trim()}</CodeBlock>
    </div>
  )
}
