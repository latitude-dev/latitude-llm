import * as k8s from '@kubernetes/client-node'
import { env } from '@latitude-data/env'

// Configuration types for K8s client initialization
export interface K8sClusterConfig {
  // For production AWS EKS
  awsRegion?: string // AWS Region
  awsAccessKey?: string // AWS Access Key
  awsSecretKey?: string // AWS Secret Key
  apiUrl?: string // EKS API endpoint URL
  eksClusterName?: string // EKS Cluster name (for logging)
  namespace: string // Default namespace for operations
}

export enum ClusterEnvironment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

const clusterConfigs = {
  [ClusterEnvironment.Test]: {
    namespace: 'latitude-test',
  },
  [ClusterEnvironment.Development]: {
    namespace: 'latitude-dev',
  },
  [ClusterEnvironment.Production]: {
    namespace: 'latitude-prod',
  },
}

export interface K8sClient {
  kc: k8s.KubeConfig
  appsV1Api: k8s.AppsV1Api
  coreV1Api: k8s.CoreV1Api
  networkingV1Api: k8s.NetworkingV1Api
  namespace: string
  environment: ClusterEnvironment
}

export const DEFAULT_NAMESPACE = 'default'

// Singleton instance of the K8s client
let k8sClientInstance: K8sClient | null = null

export function getK8sClient() {
  if (!k8sClientInstance) {
    k8sClientInstance = initializeK8sClient()
  }

  return k8sClientInstance
}

function initializeK8sClient() {
  const kc = new k8s.KubeConfig()
  const config = loadConfig()

  if (env.USE_EKS_CLUSTER) {
    if (!config.apiUrl) throw new Error('Production environment requires K8S_API_URL')
    if (!config.awsRegion) throw new Error('Production environment requires AWS_REGION')
    if (!config.awsAccessKey) throw new Error('Production environment requires AWS_ACCESS_KEY_ID')
    if (!config.awsSecretKey)
      throw new Error('Production environment requires AWS_SECRET_ACCESS_KEY')

    const cluster = {
      name: config.eksClusterName,
      server: config.apiUrl,
      caData: env.EKS_CA_DATA,
    }

    // Configure AWS IAM authenticator
    const user = {
      name: 'aws-iam-user',
      exec: {
        apiVersion: 'client.authentication.k8s.io/v1',
        command: 'aws',
        args: [
          'eks',
          'get-token',
          '--cluster-name',
          config.eksClusterName,
          '--region',
          config.awsRegion,
        ],
        env: [
          {
            name: 'AWS_ACCESS_KEY_ID',
            value: config.awsAccessKey,
          },
          {
            name: 'AWS_SECRET_ACCESS_KEY',
            value: config.awsSecretKey,
          },
        ],
      },
    }

    const context = {
      name: 'aws-context',
      cluster: cluster.name,
      user: user.name,
      namespace: config.namespace,
    }

    kc.loadFromOptions({
      clusters: [cluster],
      users: [user],
      contexts: [context],
      currentContext: context.name,
    })
  }

  // Create the client instance
  k8sClientInstance = {
    kc,
    appsV1Api: kc.makeApiClient(k8s.AppsV1Api),
    coreV1Api: kc.makeApiClient(k8s.CoreV1Api),
    networkingV1Api: kc.makeApiClient(k8s.NetworkingV1Api),
    namespace: config.namespace,
    environment: env.NODE_ENV as ClusterEnvironment,
  }

  return k8sClientInstance
}

function loadConfig() {
  // Load custom configuration from environment variables
  const customConfig: K8sClusterConfig = {
    ...clusterConfigs[env.NODE_ENV as ClusterEnvironment],
    apiUrl: env.K8S_API_URL,
    namespace: DEFAULT_NAMESPACE,
    eksClusterName: env.EKS_CLUSTER_NAME,
  }
  if (!env.USE_EKS_CLUSTER) return customConfig
  if (!env.AWS_REGION) throw new Error('Production environment requires AWS_REGION')
  if (!env.AWS_ACCESS_KEY) throw new Error('Production environment requires AWS_ACCESS_KEY_ID')
  if (!env.AWS_ACCESS_SECRET)
    throw new Error('Production environment requires AWS_SECRET_ACCESS_KEY')

  customConfig.awsRegion = env.AWS_REGION
  customConfig.awsAccessKey = env.AWS_ACCESS_KEY
  customConfig.awsSecretKey = env.AWS_ACCESS_SECRET

  return customConfig
}
