import { dumpYaml, KubernetesObject } from '@kubernetes/client-node'
import { eq } from 'drizzle-orm'
import { loadAll } from 'js-yaml'
import { database } from '../client'
import { integrations, mcpServers } from '../schema'
import { getK8sClient } from '../services/k8s'

// Define Ingress type
type Ingress = {
  kind: 'Ingress'
  metadata: {
    name: string
    namespace: string
    annotations?: Record<string, string>
  }
  spec: {
    ingressClassName?: string
    rules: Array<{
      host?: string
      hosts?: string[]
      http: {
        paths: Array<{
          path: string
          pathType: string
          backend: {
            service: {
              name: string
              port: {
                number: number
              }
            }
          }
        }>
      }
    }>
  }
}

export async function migrateOldMcpServerSchemas() {
  const servers = await database
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.status, 'deployed'))

  console.log(`Found ${servers.length} deployed MCP server(s) to migrate`)

  const client = getK8sClient()
  const k8sNetworkingApi = client.networkingV1Api

  for await (const server of servers) {
    console.log(
      `\n--- Processing server: ${server.uniqueName} (ID: ${server.id}) ---`,
    )
    console.log(`Current status: ${server.status}`)

    let manifest: KubernetesObject[]
    try {
      manifest = loadAll(server.k8sManifest) as KubernetesObject[]
      console.log(
        `Successfully parsed K8s manifest with ${manifest.length} resource(s)`,
      )
    } catch (error) {
      console.error(
        `Failed to parse K8s manifest for ${server.uniqueName}:`,
        error,
      )
      continue
    }

    const ingress = manifest.find((item) => item.kind === 'Ingress') as Ingress
    console.log(`Ingress resource found: ${!!ingress}`)

    if (ingress) {
      const hasNginxClass =
        ingress.spec.ingressClassName === 'nginx-internal-prod'
      if (hasNginxClass) {
        console.log(
          '✓ Current ingress has nginx-internal-prod class. Skipping...',
        )

        continue
      }
      console.log(`Current ingress name: ${ingress.metadata.name}`)
      console.log(`Current ingress namespace: ${ingress.metadata.namespace}`)
      console.log(
        `Current ingress class: ${ingress.spec.ingressClassName || ingress.metadata.annotations?.['kubernetes.io/ingress.class']}`,
      )
      console.log(`Current host: ${ingress.spec.rules[0]?.host}`)

      // Update ingress configuration
      console.log('Updating ingress configuration...')

      ingress.metadata.annotations = {
        'kubernetes.io/ingress.class': 'nginx-internal-prod',
        'nginx.ingress.kubernetes.io/ssl-redirect': 'false',
        'nginx.ingress.kubernetes.io/force-ssl-redirect': 'false',
        'nginx.ingress.kubernetes.io/proxy-body-size': '50m',
      }
      console.log('Updated annotations:', ingress.metadata.annotations)

      const oldIngressClassName = ingress.spec.ingressClassName
      ingress.spec.ingressClassName = 'nginx-internal-prod'
      console.log(
        `Updated ingress class: ${oldIngressClassName} -> ${ingress.spec.ingressClassName}`,
      )

      const oldHost = ingress.spec.rules[0]?.host
      const newHost = `${server.uniqueName}.latitude-internal-2.so`
      ingress.spec.rules = [
        {
          host: newHost,
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: server.uniqueName,
                    port: {
                      number: 80,
                    },
                  },
                },
              },
            ],
          },
        },
      ]
      console.log(`Updated host: ${oldHost} -> ${newHost}`)

      // Update manifest and endpoint in database
      console.log('Updating manifest and endpoint in database...')
      try {
        // Dump each resource individually and join with ---
        const manifestParts = manifest.map((resource) =>
          dumpYaml(resource).trim(),
        )
        server.k8sManifest = manifestParts.join('\n---\n')

        const newEndpoint = `${server.uniqueName}.latitude-internal-2.so`
        console.log(`Updating endpoint: ${server.endpoint} -> ${newEndpoint}`)

        await database
          .update(mcpServers)
          .set({
            k8sManifest: server.k8sManifest,
            endpoint: newEndpoint,
          })
          .where(eq(mcpServers.id, server.id))

        console.log('✓ Successfully updated manifest and endpoint in database')
      } catch (error) {
        console.error(
          '✗ Failed to update manifest and endpoint in database:',
          error,
        )
        continue
      }

      // Apply the updated ingress to K8s
      console.log('Applying updated ingress to K8s cluster...')
      try {
        await k8sNetworkingApi.replaceNamespacedIngress({
          name: ingress.metadata.name,
          namespace: ingress.metadata.namespace,
          body: ingress,
        })
        console.log('✓ Successfully updated K8s ingress')
      } catch (error) {
        console.error('✗ Failed to update K8s ingress:', error)
        continue
      }

      // Update related integrations
      console.log('Updating related integrations...')
      try {
        const relatedIntegrations = await database
          .select()
          .from(integrations)
          .where(eq(integrations.mcpServerId, server.id))

        for (const integration of relatedIntegrations) {
          if (integration.configuration) {
            const config = integration.configuration as any
            const newUrl = `${server.uniqueName}.latitude-internal-2.so`

            console.log(
              `Updating integration ${integration.name} URL: ${config.url} -> ${newUrl}`,
            )

            const updatedConfig = {
              ...config,
              url: newUrl,
            }

            await database
              .update(integrations)
              .set({ configuration: updatedConfig })
              .where(eq(integrations.id, integration.id))

            console.log(`✓ Updated integration ${integration.name}`)
          }
        }

        console.log(
          `✓ Updated ${relatedIntegrations.length} related integration(s)`,
        )
      } catch (error) {
        console.error('✗ Failed to update related integrations:', error)
        // Continue even if integration update fails
      }

      console.log(`✓ Completed migration for ${server.uniqueName}`)
    } else {
      console.log(
        `⚠ No ingress resource found for ${server.uniqueName}, skipping...`,
      )
    }
  }

  console.log(`\n=== Migration completed for ${servers.length} server(s) ===`)
}
