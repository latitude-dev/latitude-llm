import { useCallback, useMemo } from 'react'

import { Config } from '@latitude-data/compiler'
import yaml from 'yaml'

const findSeparator = (line: string) => line.trim() === '---'
export function trimStartSpace(text: string) {
  return text
    .split('\n')
    .map((line) => line.trimStart())
    .filter((line, index, arr) => !(index === arr.length - 1 && line === ''))
    .join('\n')
    .replace(/^\n+/, '')
}

type ParsedDoc = {
  beforeYaml: string
  config: Config
  afterYaml: string
}
export function useWritePromptProvider({
  prompt,
  onChangePrompt,
}: {
  prompt: string
  onChangePrompt: (prompt: string) => void
}) {
  const parsedDoc = useMemo<ParsedDoc>(() => {
    const promptLines = prompt.split('\n')
    const start = promptLines.findIndex(findSeparator)
    let parsedConfig: Config = {}

    if (start === -1) {
      return {
        beforeYaml: '',
        config: parsedConfig,
        afterYaml: prompt,
      }
    }

    const endRelative = promptLines.slice(start + 1).findIndex(findSeparator)

    if (endRelative === -1) {
      return {
        beforeYaml: '',
        config: parsedConfig,
        afterYaml: prompt,
      }
    }

    const absoluteEndIndex = start + 1 + endRelative
    const yamlSection = promptLines
      .slice(start + 1, absoluteEndIndex)
      .join('\n')
    const beforeYaml = promptLines.slice(0, start).join('\n')
    const afterYaml = promptLines.slice(absoluteEndIndex + 1).join('\n')

    try {
      parsedConfig = yaml.parse(yamlSection) as Config
    } catch {
      parsedConfig = {}
    }

    return {
      beforeYaml,
      config: parsedConfig,
      afterYaml,
    }
  }, [prompt])

  const onProviderDataChange = useCallback(
    ({ name, model }: { name: string; model: string | undefined }) => {
      const config = parsedDoc.config

      if (config.provider === name && config.model === model) return
      if (config.provider !== name) {
        config.provider = name
      }
      if (config.model !== model) {
        config.model = model
      }

      const newPrompt = trimStartSpace(`${parsedDoc.beforeYaml}
         ---
         ${trimStartSpace(yaml.stringify(config))}
         ---
         ${parsedDoc.afterYaml}`)

      onChangePrompt(newPrompt)
    },
    [parsedDoc, onChangePrompt],
  )

  return {
    onProviderDataChange,
  }
}
