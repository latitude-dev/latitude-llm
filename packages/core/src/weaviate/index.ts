import { env } from '@latitude-data/env'
import {
  ApiKey,
  configure,
  connectToLocal,
  connectToWeaviateCloud,
  vectors,
  WeaviateClient,
} from 'weaviate-client'

let connection: WeaviateClient

export const weaviate = async () => {
  if (connection) return connection

  if (!env.WEAVIATE_API_KEY) {
    throw new Error('WEAVIATE_API_KEY is not set')
  }

  if (env.WEAVIATE_URL) {
    connection = await connectToWeaviateCloud(env.WEAVIATE_URL, {
      authCredentials: new ApiKey(env.WEAVIATE_API_KEY),
    })
  } else if (env.WEAVIATE_HOST) {
    connection = await connectToLocal({
      host: env.WEAVIATE_HOST,
      port: env.WEAVIATE_HTTP_PORT,
      grpcPort: env.WEAVIATE_GRPC_PORT,
      authCredentials: new ApiKey(env.WEAVIATE_API_KEY),
    })
  } else {
    throw new Error('WEAVIATE_URL or WEAVIATE_HOST is not set')
  }

  const ready = await connection.isReady()
  const live = await connection.isLive()

  if (!ready || !live) {
    throw new Error('Cannot connect to Weaviate')
  }

  await migrateCollections()

  return connection
}

export enum Collection {
  Issues = 'Issues',
}

export const ISSUES_COLLECTION_TENANT_NAME = (
  workspaceId: number,
  projectId: number,
  documentUuid: string,
) => `${workspaceId}_${projectId}_${documentUuid}`

export type IssuesCollection = {
  // id: number // Note: the default object id is the issue id
  title: string
  description: string
  // embedding: number[] // Note: the default object vector is the issue centroid embedding
}

// Note: once the collections are migrated, changing the configuration
// is not straightforward so, care of what to change!
async function migrateCollections() {
  if (!(await connection.collections.exists(Collection.Issues))) {
    await connection.collections.create<IssuesCollection>({
      name: Collection.Issues,
      properties: [
        {
          name: 'title',
          dataType: configure.dataType.TEXT,
          indexSearchable: true, // Note: enables BM25 hybrid search
          indexFilterable: false,
          indexRangeFilters: false,
          tokenization: configure.tokenization.TRIGRAM,
          skipVectorization: true,
          vectorizePropertyName: false,
        },
        {
          name: 'description',
          dataType: configure.dataType.TEXT,
          indexSearchable: true, // Note: enables BM25 hybrid search
          indexFilterable: false,
          indexRangeFilters: false,
          tokenization: configure.tokenization.WORD,
          skipVectorization: true,
          vectorizePropertyName: false,
        },
      ],
      vectorizers: vectors.selfProvided({
        quantizer: configure.vectorIndex.quantizer.none(),
        vectorIndexConfig: configure.vectorIndex.dynamic({
          distanceMetric: configure.vectorDistances.COSINE,
          threshold: 10_000,
        }),
      }),
      invertedIndex: configure.invertedIndex({
        bm25b: 0.35, // Note: tuned for short texts
        bm25k1: 1.1, // Note: tuned for short texts
        indexTimestamps: false,
        indexPropertyLength: false,
        indexNullState: false,
      }),
      multiTenancy: configure.multiTenancy({
        enabled: true,
        autoTenantActivation: true,
        autoTenantCreation: true,
      }),
    })
  }
}

// TODO(AO): BONUS: Deactivate/offload tenants that have not had any activity in the last days
export async function getIssuesCollection({
  tenantName,
}: {
  tenantName: string
}) {
  // Note: even though the collection is configured with auto-tenant-creation, it seems
  // that for read and search operations it still fails when the tenant is not created yet

  const client = await weaviate()
  const collection = client.collections.use<Collection.Issues, IssuesCollection>(Collection.Issues) // prettier-ignore

  const exists = await collection.tenants.getByName(tenantName)
  if (!exists) {
    await collection.tenants.create([{ name: tenantName }])
  }

  return collection.withTenant(tenantName)
}
