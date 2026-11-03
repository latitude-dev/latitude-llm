import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { test } from "node:test"
import { productionConfig, stagingConfig } from "../config.ts"
import { getFargateResources } from "./fargate-resources.ts"
import { applyTaskResources } from "./task-resources.ts"

function taskFixture() {
  return {
    family: "latitude-production-web",
    cpu: "2048",
    memory: "4096",
    taskRoleArn: "arn:aws:iam::123456789012:role/application",
    containerDefinitions: [
      {
        name: "web",
        cpu: 1024,
        memory: 3072,
        image: "example/web:released-sha",
        secrets: [{ name: "DATABASE_URL", valueFrom: "example-secret-arn" }],
        environment: [{ name: "LAT_LOG_LEVEL", value: "warn" }],
        healthCheck: { command: ["CMD-SHELL", "curl -f localhost:8080/api/health"] },
      },
      { name: "datadog-agent", cpu: 256, memory: 256, image: "example/agent:released-sha" },
    ],
  }
}

test("deployment uses reviewed resources without changing images, secrets, roles, or health checks", () => {
  const task = taskFixture()
  const before = structuredClone(task)
  const result = applyTaskResources({ task, environment: "production", serviceName: "web" })
  assert.deepEqual(result, {
    ...before,
    cpu: "1024",
    memory: "2048",
    containerDefinitions: [
      { ...before.containerDefinitions[0], cpu: 768, memory: 1792 },
      before.containerDefinitions[1],
    ],
  })
  assert.deepEqual(task, before)
})

test("deployment refuses a wrong environment, service, family, or unknown container layout", () => {
  const attempts = [
    { task: taskFixture(), environment: "prod", serviceName: "web" },
    { task: taskFixture(), environment: "production", serviceName: "unknown" },
    { task: taskFixture(), environment: "staging", serviceName: "web" },
    {
      task: { ...taskFixture(), containerDefinitions: [{ name: "web" }] },
      environment: "production",
      serviceName: "web",
    },
    {
      task: { ...taskFixture(), containerDefinitions: [...taskFixture().containerDefinitions, { name: "extra" }] },
      environment: "production",
      serviceName: "web",
    },
  ]
  for (const attempt of attempts) assert.throws(() => applyTaskResources(attempt))
})

test("all configured task sizes include application and sidecar capacity", () => {
  for (const config of [stagingConfig, productionConfig]) {
    for (const service of config.ecs.services) {
      const result = getFargateResources(service)
      assert.ok(Number(result.cpu) >= service.cpu + 256)
      assert.ok(Number(result.memory) >= service.memory + 256)
    }
  }
  assert.deepEqual(getFargateResources({ cpu: 256, memory: 2048 }), { cpu: "512", memory: "3072" })
  assert.deepEqual(getFargateResources({ cpu: 1024, memory: 4096 }), { cpu: "2048", memory: "5120" })
})

test("invalid or unsupported resources fail instead of producing an undersized task", () => {
  for (const resources of [
    { cpu: 0, memory: 512 },
    { cpu: 0.5, memory: 512 },
    { cpu: 1024, memory: -1 },
    { cpu: 16384, memory: 512 },
  ]) {
    assert.throws(() => getFargateResources(resources))
  }
})

test("the deployment command reads the AWS task from stdin and emits only task JSON", () => {
  const result = spawnSync(process.execPath, ["infra/scripts/ecs-task-resources.ts", "production", "web"], {
    cwd: new URL("../../", import.meta.url),
    input: JSON.stringify(taskFixture()),
    encoding: "utf8",
  })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(
    JSON.parse(result.stdout),
    applyTaskResources({ task: taskFixture(), environment: "production", serviceName: "web" }),
  )
})
