import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

import * as shared from '../shared'

const albLogsBucket = new aws.s3.Bucket('alb-logs', {
  bucket: `${pulumi.getProject()}-${pulumi.getStack()}-alb-logs`,
  forceDestroy: true,
  acl: 'private',
})

const alb = new aws.lb.LoadBalancer('alb', {
  internal: false,
  loadBalancerType: 'application',
  securityGroups: [shared.albSecurityGroup],
  subnets: shared.publicSubnets.ids,
  accessLogs: {
    bucket: albLogsBucket.id,
    enabled: true,
  },
})

new aws.s3.BucketPolicy('alb-logs-policy', {
  bucket: albLogsBucket.id,
  policy: pulumi.all([albLogsBucket.arn]).apply(([bucketArn]) =>
    JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: {
            AWS: `arn:aws:iam::054676820928:root`,
          },
          Action: 's3:PutObject',
          Resource: `${bucketArn}/*`,
        },
      ],
    }),
  ),
})

const defaultListener = new aws.lb.Listener('httpsListener', {
  loadBalancerArn: alb.arn,
  port: 443,
  protocol: 'HTTPS',
  sslPolicy: 'ELBSecurityPolicy-2016-08',
  certificateArn: shared.certificateArn,
  defaultActions: [
    {
      type: 'fixed-response',
      fixedResponse: {
        contentType: 'text/plain',
        messageBody: 'Hello, world!',
        statusCode: '200',
      },
    },
  ],
})

new aws.lb.Listener('httpListener', {
  loadBalancerArn: alb.arn,
  port: 80,
  protocol: 'HTTP',
  defaultActions: [
    {
      type: 'redirect',
      redirect: {
        port: '443',
        protocol: 'HTTPS',
        statusCode: 'HTTP_301',
      },
    },
  ],
})

new aws.route53.Record('wildcardRecord', {
  zoneId: shared.hostedZoneId,
  name: '*.latitude.so',
  type: 'A',
  aliases: [
    {
      name: alb.dnsName,
      zoneId: alb.zoneId,
      evaluateTargetHealth: true,
    },
  ],
})

export const defaultListenerArn = defaultListener.arn
