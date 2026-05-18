import * as datadog from "@pulumi/datadog"
import type { EnvironmentConfig, ServiceConfig } from "../config.ts"

const SYNTHETIC_HEALTH_SERVICES = ["web", "api", "ingest"] as const
const SYNTHETIC_LOCATIONS = ["aws:eu-central-1"]

type SyntheticHealthService = (typeof SYNTHETIC_HEALTH_SERVICES)[number]

type SyntheticHealthServiceConfig = ServiceConfig & { name: SyntheticHealthService }

function isSyntheticHealthService(service: ServiceConfig): service is SyntheticHealthServiceConfig {
  return SYNTHETIC_HEALTH_SERVICES.includes(service.name as SyntheticHealthService)
}

function datadogApiUrl(site: string): string {
  return `https://api.${site}`
}

interface DatadogSyntheticsOptions {
  datadogSite: string
  slackAlertHandle: string
}

export function createDatadogSynthetics(name: string, envConfig: EnvironmentConfig, options: DatadogSyntheticsOptions) {
  const provider = new datadog.Provider(`${name}-datadog`, {
    apiUrl: datadogApiUrl(options.datadogSite),
  })

  const tests = Object.fromEntries(
    envConfig.ecs.services.filter(isSyntheticHealthService).map((service) => {
      const url = `https://${envConfig.domains[service.name]}${service.healthCheckPath}`
      const test = new datadog.SyntheticsTest(
        `${name}-${service.name}-health-synthetic`,
        {
          name: `[${envConfig.name}] ${service.name} health endpoint`,
          type: "api",
          subtype: "http",
          status: "live",
          locations: SYNTHETIC_LOCATIONS,
          requestDefinition: {
            method: "GET",
            url,
            timeout: 10,
          },
          assertions: [
            {
              type: "statusCode",
              operator: "is",
              target: "200",
            },
            {
              type: "body",
              operator: "contains",
              target: '"status":"ok"',
            },
            {
              type: "responseTime",
              operator: "lessThan",
              target: "5000",
            },
          ],
          optionsList: {
            tickEvery: 60,
            minFailureDuration: 120,
            minLocationFailed: 1,
            followRedirects: true,
            httpVersion: "any",
            retry: {
              count: 2,
              interval: 1000,
            },
            monitorName: `[${envConfig.name}] ${service.name} health endpoint`,
            monitorOptions: {
              renotifyInterval: 60,
              renotifyOccurrences: 3,
              notificationPresetName: "show_all",
            },
          },
          message: `Synthetic health check for ${url} failed.\n\n${options.slackAlertHandle} cc @infra/`,
          tags: [
            "app:latitude",
            `env:${envConfig.name}`,
            `service:${service.name}`,
            "team:infra",
            "managed-by:pulumi",
          ],
        },
        { provider },
      )

      return [service.name, test]
    }),
  ) as Record<SyntheticHealthService, datadog.SyntheticsTest>

  return { provider, tests }
}
