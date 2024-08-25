import * as aws from '@pulumi/aws'

import * as shared from '../shared'

const alb = new aws.lb.LoadBalancer('alb', {
  internal: false,
  loadBalancerType: 'application',
  securityGroups: [shared.albSecurityGroup],
  subnets: shared.publicSubnets.ids,
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
