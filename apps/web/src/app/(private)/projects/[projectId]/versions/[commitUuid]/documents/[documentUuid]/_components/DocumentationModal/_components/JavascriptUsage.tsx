import React from 'react'

import { HEAD_COMMIT } from '@latitude-data/core/browser'
import { CodeBlock, Text } from '@latitude-data/web-ui'

export function JavascriptUsage({
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
  const getParametersString = () => {
    if (parameters.size === 0) return ''

    const parameterEntries = Array.from(parameters)
      .map((key) => `     ${key}: ''`)
      .join(',\n')

    return `  parameters: {
${parameterEntries}
  }`
  }

  const getRunOptions = () => {
    const options = []

    if (commitUuid !== HEAD_COMMIT) {
      options.push(`  versionUuid: '${commitUuid}'`)
    }

    const parametersString = getParametersString()
    if (parametersString) {
      options.push(parametersString)
    }

    return options.length > 0 ? `{\n${options.join(',\n')}\n}` : ''
  }

  const sdkCode = `import { Latitude } from '@latitude-data/sdk'

// Do not expose the API key in client-side code
const sdk = new Latitude('${apiKey ?? 'YOUR_API_KEY'}', { projectId: ${projectId} })

const result = await sdk.run('${documentPath}'${getRunOptions() ? `, ${getRunOptions()}` : ''})
`

  return (
    <div className='flex flex-col gap-4'>
      <Text.H4>
        To run this document programmatically, First install the SDK:
      </Text.H4>
      <CodeBlock language='bash'>npm install @latitude-data/sdk</CodeBlock>
      <Text.H4>Then, use the following code to run the document:</Text.H4>
      <CodeBlock language='typescript'>{sdkCode}</CodeBlock>
      <Text.H4>
        Check out{' '}
        <a
          target='_blank'
          className='text-primary underline'
          href='https://docs.latitude.so'
        >
          our docs
        </a>{' '}
        for more details.
      </Text.H4>
    </div>
  )
}
