'use client'

import { useState } from 'react'
import {
  FrameworkDefinition,
  UnsupportedFrameworkDefinition,
  PythonOnlyFrameworkDefinition,
} from '../frameworks'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Tabs } from '@latitude-data/web-ui/molecules/Tabs'
import { InstallationStep } from './InstallationStep'
import { withIndent } from './utils'

type Language = 'typescript' | 'python'

function isPythonOnly(
  framework: FrameworkDefinition,
): framework is PythonOnlyFrameworkDefinition {
  return 'pythonOnly' in framework && framework.pythonOnly === true
}

function hasPython(framework: FrameworkDefinition): boolean {
  return 'python' in framework && framework.python !== undefined
}

function hasTypeScript(framework: FrameworkDefinition): boolean {
  return !isPythonOnly(framework)
}

function initializeCodeblockTypeScript(framework: FrameworkDefinition): string {
  if ('autoInstrumentation' in framework && framework.autoInstrumentation) {
    return `
import { LatitudeTelemetry } from '@latitude-data/telemetry'
${framework.autoInstrumentation.import}

export const telemetry = new LatitudeTelemetry(
  process.env.LATITUDE_API_KEY,
  {
  instrumentations: {
    ${framework.autoInstrumentation.line}
  },
)`.trim()
  }

  return `
import { LatitudeTelemetry } from '@latitude-data/telemetry'

export const telemetry = new LatitudeTelemetry(
  process.env.LATITUDE_API_KEY,
)`.trim()
}

function initializeCodeblockPython(framework: FrameworkDefinition): string {
  if (!hasPython(framework)) return ''
  const python = framework.python!
  return `
import os
from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions

telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    TelemetryOptions(
        instrumentors=[${python.instrumentor}],
    ),
)`.trim()
}

function implementationCodeblockTypeScript(
  framework: FrameworkDefinition,
): string {
  if (isPythonOnly(framework)) return ''

  if ('autoInstrumentation' in framework && framework.implementation) {
    return `
import { telemetry } from './telemetry'
${framework.implementation.import}

export async function generateSupportReply(input: string) {
  return telemetry.capture(
    {
      projectId: process.env.LATITUDE_PROJECT_ID,
      path: 'generate-support-reply', // Add a path to identify this prompt in Latitude
    },
    async () => {
      // Your regular LLM-powered feature code here
${withIndent(framework.implementation.codeblock, 3)}

      // You can return anything you want — the value is passed through unchanged
      return ${framework.implementation.return}
    }
  )
}`.trim()
  }

  return `
import { telemetry } from './telemetry'
import { generateAIResponse } from './generateAIResponse'

export async function generateSupportReply(input: string) {
  return telemetry.capture(
    {
      projectId: process.env.LATITUDE_PROJECT_ID,
      path: 'generate-support-reply', // Add a path to identify this prompt in Latitude
    },
    async () => {
      // Your AI generation code here
      const response = await generateAIResponse(...);

      // You can return anything you want — the value is passed through unchanged
      return response;
    }
  )
}`.trim()
}

function implementationCodeblockPython(framework: FrameworkDefinition): string {
  if (!hasPython(framework)) return ''
  const python = framework.python!
  return `
${python.implementation.imports.join('\n')}
from telemetry import telemetry

@telemetry.capture(
    project_id=os.environ["LATITUDE_PROJECT_ID"],
    path="generate-support-reply",  # Add a path to identify this prompt in Latitude
)
def generate_support_reply(input: str) -> str:
    # Your regular LLM-powered feature code here
${withIndent(python.implementation.codeblock, 1)}

    # You can return anything you want — the value is passed through unchanged
    return ${python.implementation.return}`.trim()
}

function ManualInstrumentationStep({
  framework,
}: {
  framework: UnsupportedFrameworkDefinition
}) {
  return (
    <InstallationStep
      title='Instrument your AI calls'
      description={`Inside your generation function, create a completion span before calling ${framework.name}. Then, end it after the response is returned.`}
    >
      <CodeBlock language='ts' textWrap={false}>
        {`
import { telemetry } from './telemetry'
${framework.manualInstrumentation.completion.imports.join('\n')}

export async function generateAIResponse(input: string) {
  const model = '${framework.manualInstrumentation.completion.model}'

  // 1) Start the completion span
  const span = telemetry.span.completion({
    model,
    input: [{ role: 'user', content: input }]
  })

  try {
    // 2) Call ${framework.name} as usual
${withIndent(framework.manualInstrumentation.completion.codeblock, 2)}

    // 3) End the span (attach output + useful metadata)
    span.end({
      output: [{ role: 'assistant', content: response }],
    })

    ${framework.manualInstrumentation.completion.return}
  } catch (error) {

    // Make sure to close the span even on errors
    span.fail(error)
    throw error
  }
}
`.trim()}
      </CodeBlock>
    </InstallationStep>
  )
}

function LanguageTabs({
  framework,
  activeTab,
  onTabChange,
  children,
}: {
  framework: FrameworkDefinition
  activeTab: Language
  onTabChange: (tab: Language) => void
  children: (tab: Language) => React.ReactNode
}) {
  const showTabs = hasTypeScript(framework) && hasPython(framework)

  if (!showTabs) {
    return <>{children(isPythonOnly(framework) ? 'python' : 'typescript')}</>
  }

  return (
    <Tabs
      tabs={[
        { id: 'typescript', label: 'TypeScript' },
        { id: 'python', label: 'Python' },
      ]}
      activeTab={activeTab}
      onChange={(tab) => onTabChange(tab as Language)}
    >
      {(tab) => <div className='p-4'>{children(tab as Language)}</div>}
    </Tabs>
  )
}

export function InstallationSteps({
  framework,
  workspaceApiKey,
  projectId,
}: {
  framework: FrameworkDefinition
  workspaceApiKey?: string
  projectId: number
}) {
  const [activeTab, setActiveTab] = useState<Language>(
    isPythonOnly(framework) ? 'python' : 'typescript',
  )

  const pythonOnlyMode = isPythonOnly(framework)

  return (
    <>
      <InstallationStep title='Install Latitude Telemetry using your package manager'>
        {pythonOnlyMode ? (
          <CodeBlock language='bash'>
            {`
pip install latitude-telemetry
# or
uv add latitude-telemetry
# or
poetry add latitude-telemetry
            `.trim()}
          </CodeBlock>
        ) : (
          <LanguageTabs
            framework={framework}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          >
            {(tab) => (
              <CodeBlock language='bash'>
                {tab === 'typescript'
                  ? `
npm install @latitude-data/telemetry
# or
yarn add @latitude-data/telemetry
# or
pnpm add @latitude-data/telemetry
                  `.trim()
                  : `
pip install latitude-telemetry
# or
uv add latitude-telemetry
# or
poetry add latitude-telemetry
                  `.trim()}
              </CodeBlock>
            )}
          </LanguageTabs>
        )}
      </InstallationStep>

      <InstallationStep
        title='Add environment variables'
        description='Add your environment variables to your .env file and to your container environment if you are using one. You can find your Workspace API Key and Project ID in your Workspace and Project settings respectively.'
      >
        <CodeBlock language='bash'>
          {`
LATITUDE_API_KEY=${workspaceApiKey ?? '00000000-0000-0000-0000-000000000000'}
LATITUDE_PROJECT_ID=${projectId}
            `.trim()}
        </CodeBlock>
      </InstallationStep>

      <InstallationStep
        title='Initialize Latitude Telemetry'
        description='Create a single Telemetry instance when your app starts.'
      >
        <>
          {pythonOnlyMode ? (
            <CodeBlock language='python' textWrap={false}>
              {initializeCodeblockPython(framework)}
            </CodeBlock>
          ) : (
            <LanguageTabs
              framework={framework}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            >
              {(tab) => (
                <CodeBlock
                  language={tab === 'typescript' ? 'ts' : 'python'}
                  textWrap={false}
                >
                  {tab === 'typescript'
                    ? initializeCodeblockTypeScript(framework)
                    : initializeCodeblockPython(framework)}
                </CodeBlock>
              )}
            </LanguageTabs>
          )}
          <Alert description='The telemetry instance should only be created once, and imported everywhere you need to use it.' />
        </>
      </InstallationStep>

      <InstallationStep
        title='Wrap your AI call'
        description='Wrap the code that generates the AI response using telemetry.capture. You must add a path to identify this prompt in your Latitude project.'
      >
        <>
          {pythonOnlyMode ? (
            <CodeBlock language='python' textWrap={false}>
              {implementationCodeblockPython(framework)}
            </CodeBlock>
          ) : (
            <LanguageTabs
              framework={framework}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            >
              {(tab) => (
                <CodeBlock
                  language={tab === 'typescript' ? 'ts' : 'python'}
                  textWrap={false}
                >
                  {tab === 'typescript'
                    ? implementationCodeblockTypeScript(framework)
                    : implementationCodeblockPython(framework)}
                </CodeBlock>
              )}
            </LanguageTabs>
          )}
          <Alert description='The path is used to identify the prompt in your Latitude project. It must not contain spaces or special characters (use letters, numbers, - _ / .), and it will automatically create a new prompt in your Latitude project if it does not exist.' />
        </>
      </InstallationStep>

      {'manualInstrumentation' in framework && !pythonOnlyMode && (
        <ManualInstrumentationStep framework={framework} />
      )}
    </>
  )
}
