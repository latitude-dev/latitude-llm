import type { ServiceConfig } from "../config.ts"

export const DATADOG_AGENT_CPU = 256
export const DATADOG_AGENT_MEMORY = 256

const FARGATE_OPTIONS = [
  { cpu: 256, minMemory: 512, maxMemory: 2048, step: 512 },
  { cpu: 512, minMemory: 1024, maxMemory: 4096, step: 1024 },
  { cpu: 1024, minMemory: 2048, maxMemory: 8192, step: 1024 },
  { cpu: 2048, minMemory: 4096, maxMemory: 16384, step: 1024 },
  { cpu: 4096, minMemory: 8192, maxMemory: 30720, step: 1024 },
  { cpu: 8192, minMemory: 16384, maxMemory: 61440, step: 4096 },
  { cpu: 16384, minMemory: 32768, maxMemory: 122880, step: 8192 },
] as const

export function getFargateResources(service: Pick<ServiceConfig, "cpu" | "memory">) {
  if (!Number.isInteger(service.cpu) || service.cpu <= 0 || !Number.isInteger(service.memory) || service.memory <= 0) {
    throw new Error("Container CPU and memory must be positive integers")
  }

  const cpu = service.cpu + DATADOG_AGENT_CPU
  const memory = service.memory + DATADOG_AGENT_MEMORY
  const option = FARGATE_OPTIONS.find((candidate) => candidate.cpu >= cpu && memory <= candidate.maxMemory)
  if (!option) throw new Error("Container resources exceed the largest Fargate task size")

  return {
    cpu: option.cpu.toString(),
    memory: (Math.ceil(Math.max(memory, option.minMemory) / option.step) * option.step).toString(),
  }
}
