import { productionConfig, stagingConfig } from "../config.ts"
import { DATADOG_AGENT_CPU, DATADOG_AGENT_MEMORY, getFargateResources } from "./fargate-resources.ts"

interface ContainerDefinition {
  name: string
  cpu?: number
  memory?: number
}

interface TaskDefinition {
  family: string
  cpu?: string
  memory?: string
  containerDefinitions: ContainerDefinition[]
}

export function isTaskDefinition(task: unknown): task is TaskDefinition {
  if (typeof task !== "object" || task === null || !("family" in task) || typeof task.family !== "string") return false
  if (!("containerDefinitions" in task) || !Array.isArray(task.containerDefinitions)) return false
  return task.containerDefinitions.every(
    (container: unknown) =>
      typeof container === "object" && container !== null && "name" in container && typeof container.name === "string",
  )
}

export function applyTaskResources<T extends TaskDefinition>({
  task,
  environment,
  serviceName,
}: {
  task: T
  environment: string
  serviceName: string
}): T {
  if (environment !== "staging" && environment !== "production") throw new Error("Unknown deployment environment")
  const config = environment === "production" ? productionConfig : stagingConfig
  const service = config.ecs.services.find((candidate) => candidate.name === serviceName)
  if (!service) throw new Error("Unknown deployment service")
  if (task.family !== `latitude-${environment}-${serviceName}`) throw new Error("Task family does not match deployment")
  const names = task.containerDefinitions.map((container) => container.name)
  if (names.length !== 2 || !names.includes(serviceName) || !names.includes("datadog-agent")) {
    throw new Error("Expected the application container and Datadog sidecar")
  }

  return {
    ...task,
    ...getFargateResources(service),
    containerDefinitions: task.containerDefinitions.map((container) => ({
      ...container,
      cpu: container.name === serviceName ? service.cpu : DATADOG_AGENT_CPU,
      memory: container.name === serviceName ? service.memory : DATADOG_AGENT_MEMORY,
    })),
  }
}
