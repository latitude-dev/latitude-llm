import { dirname, resolve as resolveFn } from 'path'
import { fileURLToPath } from 'url'

import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

export const getPublicSubnets = async () => {
  return await aws.ec2.getSubnets({
    filters: [
      {
        name: 'tag:Name',
        values: [`latitude-public-subnet-1`, `latitude-public-subnet-2`],
      },
    ],
  })
}

export const getPrivateSubnets = async () => {
  return await aws.ec2.getSubnets({
    filters: [
      {
        name: 'tag:Name',
        values: [`latitude-private-subnet-1`, `latitude-private-subnet-2`],
      },
    ],
  })
}

export const publicSubnets = pulumi.output(getPublicSubnets())
export const privateSubnets = pulumi.output(getPrivateSubnets())

export const albSecurityGroup = 'sg-075fe1e81dfdba506'
export const certificateArn =
  'arn:aws:acm:eu-central-1:442420265876:certificate/5eef5b60-a66e-4f12-b691-86b57716af2c'
export const ecsSecurityGroup = 'sg-0619cea3f53af9fb3'
export const hostedZoneId = 'Z04918046RTZRA6UX0HY' // latitude.so
export const vpcId = 'vpc-06721425006e988f9' // eu-central
export const ecsTaskExecutionRole =
  'arn:aws:iam::442420265876:role/latitude-execution-task-role'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// get vpc
export const euCentralVpc = await aws.ec2.getVpc({ id: vpcId })

export const resolve = (path: string) => resolveFn(__dirname, path)
