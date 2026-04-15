import type { Input } from "@pulumi/pulumi"

export interface EnvironmentConfig {
  name: "staging" | "production"
  region: string
  azCount: number
  enableNat: boolean
  vpcCidr: string

  domains: {
    web: string
    api: string
    ingest: string
    bullBoard: string
  }

  rds: {
    type: "aurora-serverless" | "standard"
    instanceType?: string
    minAcu?: number
    maxAcu?: number
    multiAz: boolean
    backupDays: number
  }

  redis: {
    cache: {
      type: "elasticache" | "memorydb"
      nodeType: string
      numNodes: number
      multiAz: boolean
    }
    bullmq: {
      type: "elasticache" | "memorydb"
      nodeType: string
      numNodes: number
      multiAz: boolean
      evictionPolicy: string
    }
  }

  ecs: {
    services: ServiceConfig[]
  }

  s3: {
    bucketName: string
    versioning: boolean
    lifecycleDays: number
  }

}

export interface ServiceConfig {
  name: "web" | "api" | "ingest" | "workers" | "workflows"
  cpu: number
  memory: number
  port?: number
  healthCheckPath: string
  desiredCount: number
  minCount: number
  maxCount: number
}

export interface StackConfig {
  env: EnvironmentConfig
  hostedZoneId: string
  domainName: string
  imageTag: Input<string>
}

export const stagingConfig: EnvironmentConfig = {
  name: "staging",
  region: "eu-central-1",
  azCount: 2,
  enableNat: false,
  vpcCidr: "10.0.0.0/16",

  domains: {
    web: "staging.latitude.so",
    api: "staging-api.latitude.so",
    ingest: "staging-ingest.latitude.so",
    bullBoard: "staging-bull-board.latitude.so",
  },

  rds: {
    type: "standard",
    instanceType: "db.t4g.micro",
    multiAz: false,
    backupDays: 1,
  },

  redis: {
    cache: {
      type: "elasticache",
      nodeType: "cache.t3.micro",
      numNodes: 1,
      multiAz: false,
    },
    bullmq: {
      type: "elasticache",
      nodeType: "cache.t3.micro",
      numNodes: 1,
      multiAz: false,
      evictionPolicy: "noeviction",
    },
  },

  ecs: {
    services: [
      {
        name: "web",
        cpu: 256,
        memory: 512,
        port: 8080,
        healthCheckPath: "/api/health",
        desiredCount: 1,
        minCount: 1,
        maxCount: 1,
      },
      {
        name: "api",
        cpu: 256,
        memory: 512,
        port: 8080,
        healthCheckPath: "/health",
        desiredCount: 1,
        minCount: 1,
        maxCount: 1,
      },
      {
        name: "ingest",
        cpu: 256,
        memory: 512,
        port: 8080,
        healthCheckPath: "/health",
        desiredCount: 1,
        minCount: 1,
        maxCount: 1,
      },
      {
        name: "workers",
        cpu: 256,
        memory: 512,
        port: 8080,
        healthCheckPath: "/health",
        desiredCount: 1,
        minCount: 1,
        maxCount: 1,
      },
      {
        name: "workflows",
        // Match production sizing: Temporal worker webpack-bundles workflows at startup and needs RAM.
        cpu: 512,
        memory: 1024,
        port: 8080,
        healthCheckPath: "/health",
        desiredCount: 1,
        minCount: 1,
        maxCount: 1,
      },
    ],
  },

  s3: {
    bucketName: "latitude-staging-spans",
    versioning: false,
    lifecycleDays: 30,
  },
}

export const productionConfig: EnvironmentConfig = {
  name: "production",
  region: "eu-central-1",
  azCount: 2,
  enableNat: true,
  vpcCidr: "10.1.0.0/16",

  domains: {
    web: "console.latitude.so",
    api: "api.latitude.so",
    ingest: "ingest.latitude.so",
    bullBoard: "bull-board.latitude.so",
  },

  rds: {
    type: "aurora-serverless",
    minAcu: 0.5,
    maxAcu: 2,
    multiAz: true,
    backupDays: 7,
  },

  redis: {
    cache: {
      type: "memorydb",
      nodeType: "db.t4g.small",
      numNodes: 2,
      multiAz: true,
    },
    bullmq: {
      type: "memorydb",
      nodeType: "db.t4g.small",
      numNodes: 2,
      multiAz: true,
      evictionPolicy: "noeviction",
    },
  },

  ecs: {
    services: [
      {
        name: "web",
        cpu: 512,
        memory: 1024,
        port: 8080,
        healthCheckPath: "/api/health",
        desiredCount: 1,
        minCount: 1,
        maxCount: 3,
      },
      {
        name: "api",
        cpu: 256,
        memory: 512,
        port: 8080,
        healthCheckPath: "/health",
        desiredCount: 1,
        minCount: 1,
        maxCount: 3,
      },
      {
        name: "ingest",
        cpu: 512,
        memory: 1024,
        port: 8080,
        healthCheckPath: "/health",
        desiredCount: 1,
        minCount: 1,
        maxCount: 3,
      },
      {
        name: "workers",
        cpu: 512,
        memory: 1024,
        port: 8080,
        healthCheckPath: "/health",
        desiredCount: 1,
        minCount: 1,
        maxCount: 3,
      },
      {
        name: "workflows",
        cpu: 512,
        memory: 1024,
        port: 8080,
        healthCheckPath: "/health",
        desiredCount: 1,
        minCount: 1,
        maxCount: 3,
      },
    ],
  },

  s3: {
    bucketName: "latitude-production-spans",
    versioning: true,
    lifecycleDays: 90,
  },
}

export const defaults = {
  hostedZoneId: "Z04918046RTZRA6UX0HY",
  domainName: "latitude.so",
}
