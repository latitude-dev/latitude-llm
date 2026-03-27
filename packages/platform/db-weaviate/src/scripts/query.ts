import { existsSync } from "node:fs"
import { parseArgs } from "node:util"
import { createWeaviateClient } from "../client.ts"

const envFilePath = new URL("../../../../../.env.development", import.meta.url)
if (existsSync(envFilePath)) {
  process.loadEnvFile(envFilePath)
}

const USAGE = `
Usage: pnpm --filter @platform/db-weaviate wv:query <command> [options]

Commands:
  schema                       List all collections
  schema <name>                Show full schema for a collection
  tenants [name]               List tenants (defaults to all collections)
  objects [name]               List objects (iterates tenants when --tenant omitted)
  count [name]                 Count objects (iterates tenants when --tenant omitted)

Options:
  --tenant <name>              Scope to a specific tenant
  --limit <n>                  Max objects to return (default: 10)
  --help                       Show this help

Examples:
  wv:query schema                          # list all collections
  wv:query schema Issues                   # full schema for Issues
  wv:query tenants                         # list tenants across all collections
  wv:query tenants Issues                  # list tenants for Issues
  wv:query objects Issues                  # list objects across all Issues tenants
  wv:query objects Issues --tenant orgId_projectId
  wv:query count Issues                    # count across all Issues tenants
  wv:query count Issues --tenant orgId_projectId --limit 5
`.trim()

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    tenant: { type: "string" },
    limit: { type: "string", default: "10" },
    help: { type: "boolean", default: false },
  },
})

if (values.help || positionals.length === 0) {
  console.log(USAGE)
  process.exit(0)
}

const [command, collectionName] = positionals

const json = (data: unknown) => console.log(JSON.stringify(data, null, 2))

type Client = Awaited<ReturnType<typeof createWeaviateClient>>

const resolveCollectionNames = async (client: Client, name?: string) => {
  if (name) return [name]
  const all = await client.collections.listAll()
  return all.map((c) => c.name)
}

const resolveTenantNames = async (client: Client, name: string, tenant?: string): Promise<string[]> => {
  if (tenant) return [tenant]
  const collection = client.collections.use(name)
  const config = await collection.config.get()
  if (!config.multiTenancy.enabled) return [""]
  const tenants = await collection.tenants.get()
  return Object.keys(tenants)
}

const run = async () => {
  const client = await createWeaviateClient()

  switch (command) {
    case "schema": {
      if (collectionName) {
        const collection = client.collections.use(collectionName)
        const config = await collection.config.get()
        json(config)
      } else {
        const allCollections = await client.collections.listAll()
        const names = allCollections.map((c) => c.name)
        console.log(`Collections (${names.length}):`)
        for (const name of names) console.log(`  - ${name}`)
      }
      break
    }

    case "tenants": {
      const names = await resolveCollectionNames(client, collectionName)
      for (const name of names) {
        const collection = client.collections.use(name)
        const tenants = await collection.tenants.get()
        const entries = Object.entries(tenants)
        console.log(`Tenants for ${name} (${entries.length}):`)
        for (const [tenantName, tenant] of entries) {
          console.log(`  - ${tenantName}  (status: ${tenant.activityStatus})`)
        }
      }
      break
    }

    case "objects": {
      const names = await resolveCollectionNames(client, collectionName)
      const limit = Number.parseInt(values.limit ?? "10", 10)
      for (const name of names) {
        const tenantNames = await resolveTenantNames(client, name, values.tenant)
        for (const tenant of tenantNames) {
          let collection = client.collections.use(name)
          if (tenant) collection = collection.withTenant(tenant)
          const result = await collection.query.fetchObjects({ limit, includeVector: true })
          const scope = tenant ? ` (tenant: ${tenant})` : ""
          console.log(`Objects in ${name}${scope} (showing up to ${limit}):`)
          for (const obj of result.objects) {
            console.log(`\n  uuid: ${obj.uuid}`)
            json(obj.properties)
            if (obj.vectors.default) {
              console.log(`  vector: [${obj.vectors.default.length} dims]`)
            }
          }
          if (result.objects.length === 0) console.log("  (none)")
        }
      }
      break
    }

    case "count": {
      const names = await resolveCollectionNames(client, collectionName)
      for (const name of names) {
        const tenantNames = await resolveTenantNames(client, name, values.tenant)
        for (const tenant of tenantNames) {
          let collection = client.collections.use(name)
          if (tenant) collection = collection.withTenant(tenant)
          const { totalCount } = await collection.aggregate.overAll()
          const scope = tenant ? ` (tenant: ${tenant})` : ""
          console.log(`${name}${scope}: ${totalCount} objects`)
        }
      }
      break
    }

    default: {
      console.error(`Unknown command: ${command}`)
      console.log(USAGE)
      process.exit(1)
    }
  }
}

void run().catch((error: unknown) => {
  console.error("Error:", error)
  process.exitCode = 1
})
