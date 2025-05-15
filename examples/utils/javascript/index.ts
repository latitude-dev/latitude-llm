import chalk from 'chalk'
import { Options } from '@latitude-data/sdk'

const SETTINGS_URL = 'https://app.latitude.so/settings'
const DASHBOARD_URL = 'https://app.latitude.so/dashboard'

const GATEWAY_HOST = process.env.GATEWAY_HOST
const GATEWAY_PORT = process.env.GATEWAY_PORT

type ForcedOptions = Pick<Options, 'projectId' | 'versionUuid'>

function getConfigOrError(options: ForcedOptions) {
  if (!process.env.LATITUDE_API_KEY) {
    console.error(
      chalk.red.bold('🚨  Missing LATITUDE_API_KEY!\n') +
      chalk.yellow(
        'Please set your API key as an environment variable.\n\n',
      ) +
      chalk.cyan.underline(`Get one here: ${SETTINGS_URL}\n`),
    )
    process.exit(1)
  }

  if (!options.projectId) {
    console.error(
      chalk.red.bold('🚨  Missing projectId!\n') +
      chalk.yellow('You must select a project to work with.\n\n') +
      chalk.cyan.underline(`Choose one here: ${DASHBOARD_URL}\n`),
    )
    process.exit(1)
  }

  // Everything’s present—return the sanitized config
  return {
    apiKey: process.env.LATITUDE_API_KEY!,
    projectId: options.projectId,
  }
}

export function getSDKDefaultOptions(options: ForcedOptions) {
  const { apiKey, projectId } = getConfigOrError(options)

  if (!GATEWAY_HOST || !GATEWAY_PORT) {
    return {
      apiKey,
      options: { ...options, projectId },
    }
  }

  return {
    apiKey,
    options: {
      ...options,
      projectId,
      __internal: {
        gateway: {
          host: GATEWAY_HOST,
          port: parseInt(GATEWAY_PORT),
          ssl: false,
        },
      },
    },
  }
}
