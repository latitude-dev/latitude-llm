import yaml from 'js-yaml'
import Mustache from 'mustache'
import { env } from '@latitude-data/env'

// Default resource parameters
export const DEFAULT_PARAMS = {
  IMAGE: 'ghcr.io/latitude-dev/latitude-mcp:latest',
  REPLICAS: '1',
  COMMAND: 'sh',
  ARGS: JSON.stringify([
    '-c',
    "echo 'Container is running. Override this command at runtime.' && tail -f /dev/null",
  ]),
  NODE_ENV: env.NODE_ENV,
}

/**
 * Applies parameters to a Kubernetes manifest template using Mustache
 *
 * @param templateContent - The YAML template content as a string
 * @param parameters - Object containing parameters to apply to the template
 * @returns Parsed YAML object with parameters applied
 */
export function applyParameters(
  templateContent: string,
  parameters: Record<string, any>,
) {
  // Create a new object with defaults first, then override with provided parameters
  const mergedParams = { ...DEFAULT_PARAMS } as Record<string, any>

  // Only override with provided parameters if they have values
  Object.keys(parameters).forEach((key) => {
    if (parameters[key] !== undefined && parameters[key] !== '') {
      mergedParams[key] = parameters[key]
    }
  })

  // Special handling for NODE_PORT - only include if > 0
  if (parseInt(mergedParams.NODE_PORT) <= 0) {
    mergedParams.NODE_PORT = false
  }

  // Add HAS_ENV_VARS flag if we have environment variables
  if (parameters.SECRET_DATA) {
    mergedParams.HAS_ENV_VARS = true
  }

  // Render the template with Mustache
  const rendered = Mustache.render(templateContent, mergedParams)

  // Parse the rendered YAML
  return yaml.load(rendered)
}
