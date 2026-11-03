import { readFileSync } from "node:fs"
import { applyTaskResources, isTaskDefinition } from "../lib/task-resources.ts"

const [environment, serviceName] = process.argv.slice(2)
if (!environment || !serviceName) throw new Error("Usage: ecs-task-resources.ts <environment> <service>")

const task: unknown = JSON.parse(readFileSync(0, "utf8"))
if (!isTaskDefinition(task)) throw new Error("Expected an AWS ECS task definition")
process.stdout.write(JSON.stringify(applyTaskResources({ task, environment, serviceName })))
