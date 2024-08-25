import * as aws from '@pulumi/aws'

import { publicSubnets, vpcId } from '../shared'
import { rdsSecurityGroupId } from './rds'

const ec2SecurityGroup = new aws.ec2.SecurityGroup('latitude-llm-ec2-sg', {
  vpcId,
  ingress: [
    {
      protocol: 'tcp',
      fromPort: 22,
      toPort: 22,
      cidrBlocks: ['0.0.0.0/0'], // Allow SSH from anywhere
    },
    {
      protocol: 'tcp',
      fromPort: 5432,
      toPort: 5432,
      securityGroups: [rdsSecurityGroupId], // Allow PostgreSQL from RDS security group
    },
  ],
  egress: [
    {
      protocol: '-1',
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ['0.0.0.0/0'],
    },
  ],
})

new aws.ec2.Instance('latitude-llm-ec2', {
  instanceType: 't3.micro',
  ami: 'ami-01e444924a2233b07',
  subnetId: publicSubnets.ids[0],
  vpcSecurityGroupIds: [ec2SecurityGroup.id],
  keyName: 'latitude',
  tags: {
    Name: 'latitude-llm-ec2',
  },
})
