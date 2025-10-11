import { IntegrationDto } from "@latitude-data/core/schema/types";

export function isValidIntegration(name: string, integrations: IntegrationDto[]) {
  return (
    name === 'latitude' ||
    integrations.some((integration) => integration.name === name)
  )
}
