import * as aws from '@pulumi/aws'
import * as docker from '@pulumi/docker'
import * as pulumi from '@pulumi/pulumi'

import { resolve } from '../../shared'

const gatewayProductionStack = new pulumi.StackReference('app-production-web')
const repo = gatewayProductionStack.requireOutput(
  'repo',
) as pulumi.Output<aws.ecr.Repository>

const token = await aws.ecr.getAuthorizationToken()

if (!process.env.IMAGE_TAG) {
  throw new Error('IMAGE_TAG is not set')
}

new docker.Image('LatitudeLLMGatewayImage', {
  build: {
    platform: 'linux/amd64',
    context: resolve('../../../'),
    dockerfile: resolve('../../../apps/gateway/docker/Dockerfile'),
    cacheFrom: {
      images: [pulumi.interpolate`${repo.repositoryUrl}:latest`],
    },
  },
  imageName: pulumi.interpolate`${repo.repositoryUrl}:${process.env.IMAGE_TAG}`,
  registry: {
    server: repo.repositoryUrl,
    username: token.userName,
    password: pulumi.secret(token.password),
  },
})
