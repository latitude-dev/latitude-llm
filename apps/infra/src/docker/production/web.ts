import * as aws from '@pulumi/aws'
import * as docker from '@pulumi/docker'
import * as pulumi from '@pulumi/pulumi'

import {
  latitudeUrl,
  postHogApiKey,
  sentryDsn,
  sentryOrg,
  sentryProject,
} from '../../app/production/shared'
import { resolve } from '../../shared'

const webProductionStack = new pulumi.StackReference('app-production-web')

const repo = webProductionStack.requireOutput(
  'repo',
) as pulumi.Output<aws.ecr.Repository>
const coreRepo = webProductionStack.requireOutput(
  'coreRepo',
) as pulumi.Output<aws.ecr.Repository>

const token = await aws.ecr.getAuthorizationToken()

if (!process.env.IMAGE_TAG) {
  throw new Error('IMAGE_TAG is not set')
}

pulumi
  .all([sentryDsn, sentryOrg, sentryProject, postHogApiKey, latitudeUrl])
  .apply(([sentryDsn, sentryOrg, sentryProject, postHogApiKey, latitudeUrl]) => {
    const webImageBuild = {
      platform: 'linux/amd64',
      context: resolve('../../../'),
      dockerfile: resolve('../../../apps/web/docker/Dockerfile'),
      args: {
        SENTRY_DSN: sentryDsn,
        SENTRY_ORG: sentryOrg,
        SENTRY_PROJECT: sentryProject,
        SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN!,
        NEXT_PUBLIC_POSTHOG_KEY: postHogApiKey,
        NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
        LATITUDE_URL: latitudeUrl,
      },
    }

    const registryConfig = {
      server: repo.repositoryUrl,
      username: token.userName,
      password: pulumi.secret(token.password),
    }

    // Create image with specific tag
    new docker.Image('LatitudeLLMAppImage', {
      build: webImageBuild,
      imageName: pulumi.interpolate`${repo.repositoryUrl}:${process.env.IMAGE_TAG}`,
      registry: registryConfig,
    })

    // Create image with latest tag
    new docker.Image('LatitudeLLMAppImageLatest', {
      build: webImageBuild,
      imageName: pulumi.interpolate`${repo.repositoryUrl}:latest`,
      registry: registryConfig,
    })
  })

// Similarly for the core image
const coreImageBuild = {
  platform: 'linux/amd64',
  context: resolve('../../../'),
  dockerfile: resolve('../../../packages/core/docker/Dockerfile'),
}

const coreRegistryConfig = {
  server: coreRepo.repositoryUrl,
  username: token.userName,
  password: pulumi.secret(token.password),
}

// Create core image with specific tag
new docker.Image('LatitudeLLMCoreImage', {
  build: coreImageBuild,
  imageName: pulumi.interpolate`${coreRepo.repositoryUrl}:${process.env.IMAGE_TAG}`,
  registry: coreRegistryConfig,
})

// Create core image with latest tag
new docker.Image('LatitudeLLMCoreImageLatest', {
  build: coreImageBuild,
  imageName: pulumi.interpolate`${coreRepo.repositoryUrl}:latest`,
  registry: coreRegistryConfig,
})
