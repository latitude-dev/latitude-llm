import { env } from '@latitude-data/env'
import { createHash } from 'crypto'
import Mustache from 'mustache'
import { TEMPLATES } from './k8sTemplates'

function buildCommand(command: string): string {
  const executeCommand = `npx -y @latitude-data/supergateway --stdio ${JSON.stringify(command)}`
  return `"sh", "-c", ${JSON.stringify(executeCommand)}`
}

type K8sDeploymentParams = {
  appName: string
  environmentVariables?: Record<string, string>
  workspaceId: number
  authorId: string
  namespace: string
  command?: string
  image?: string
  replicas?: number
  args?: string[]
}

/**
 * Generate a complete Kubernetes YAML manifest for an application
 *
 * This function combines deployment, service, configmap, and optional ingress
 * into a single multi-document YAML file
 */
export function generateK8sManifest(params: K8sDeploymentParams): {
  manifest: string
  secretManifest?: string
} {
  const { appName, environmentVariables = {} } = params

  // Generate a unique hash for secrets to ensure they're updated when env vars change
  const secretHash = createHash('sha1')
    .update(JSON.stringify(environmentVariables))
    .digest('hex')
    .substring(0, 8)

  // Common parameters for all templates
  const templateParams: Record<string, any> = {
    NAME: appName,
    IMAGE: env.MCP_DOCKER_IMAGE,
    REPLICAS: '1',
    SERVICE_TYPE: 'ClusterIP',
    CPU_LIMIT: '500m',
    MEMORY_LIMIT: '512Mi',
    CPU_REQUEST: '200m',
    MEMORY_REQUEST: '256Mi',
    LATITUDE_MCP_HOST: env.LATITUDE_MCP_HOST,
    NAMESPACE: params.namespace,
    NODE_ENV: env.NODE_ENV,
    SCHEME: env.MCP_SCHEME,
    SECRET_HASH: secretHash,
    NODE_GROUP_NAME: env.MCP_NODE_GROUP_NAME,
    // TODO: Remove NODE_ENV check and move to proper env var
    INGRESS_CLASS_NAME:
      env.NODE_ENV === 'production' ? 'nginx-internal-prod' : 'nginx',
  }

  // Add command and args if provided
  if (params.command) {
    // Use the escape function to safely format the command
    templateParams.COMMAND = buildCommand(params.command)
  }

  if (params.args && params.args.length > 0) {
    templateParams.ARGS = JSON.stringify(params.args)
  }

  // Flag for environment variables
  if (Object.keys(environmentVariables).length > 0) {
    templateParams.HAS_ENV_VARS = true
  }

  // Generate the manifests for deployment, service, and configmap
  const deploymentTemplate = TEMPLATES['deployment/latitude-mcp']?.content || ''
  const serviceTemplate = TEMPLATES['service/latitude-mcp']?.content || ''
  const ingressTemplate = TEMPLATES['ingress/latitude-app']?.content || ''

  // Check if templates exist
  if (!deploymentTemplate) {
    throw new Error('Deployment template not found')
  }
  if (!serviceTemplate) {
    throw new Error('Service template not found')
  }
  if (!ingressTemplate) {
    throw new Error('Ingress template not found')
  }

  // Render each template with Mustache
  const deploymentYaml = Mustache.render(deploymentTemplate, templateParams)
  const serviceYaml = Mustache.render(serviceTemplate, templateParams)
  const ingressYaml = Mustache.render(ingressTemplate, templateParams)

  // Combine into a multi-document YAML
  const combinedManifest = `${deploymentYaml}
---
${serviceYaml}
---
${ingressYaml}`

  // Handle secrets separately (we don't want to store them in the combined manifest)
  let secretManifest
  if (Object.keys(environmentVariables).length > 0) {
    // Create secret data in base64 format
    const secretData = Object.entries(environmentVariables)
      .map(
        ([key, value]) =>
          `${key}: ${Buffer.from(value as string).toString('base64')}`,
      )
      .join('\n  ')

    const secretParams = {
      ...templateParams,
      SECRET_DATA: secretData,
    }

    const secretTemplate = TEMPLATES['secret/app-secrets']?.content
    if (!secretTemplate) {
      throw new Error('Secret template not found')
    }

    secretManifest = Mustache.render(secretTemplate, secretParams)
  }

  return {
    manifest: combinedManifest,
    secretManifest,
  }
}
