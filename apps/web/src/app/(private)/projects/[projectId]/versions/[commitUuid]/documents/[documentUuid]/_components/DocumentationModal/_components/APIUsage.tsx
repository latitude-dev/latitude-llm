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
    const body = {
      path: documentPath,
      stream: false,
    } as Record<string, unknown>

    if (parameters.size > 0) {
      body['parameters'] = Array.from(parameters).reduce(
        (acc, param) => ({ ...acc, [param]: '' }),
        {},
      )
    }

    return JSON.stringify(body, null, 2)
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n')
  }

  const apiCode = `
curl -X POST \\
  https://gateway.latitude.so/api/v2/projects/${projectId}/versions/${commitUuid}/documents/run \\
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
