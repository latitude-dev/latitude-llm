import * as aws from "@pulumi/aws"
import type { Output } from "@pulumi/pulumi"
import type { EnvironmentConfig } from "../config.ts"
import type { Ec2SecurityGroup, Ec2Subnet, LbListener, LbLoadBalancer, LbTargetGroup } from "./types.ts"

export interface AlbOutput {
  alb: LbLoadBalancer
  targetGroups: Record<string, LbTargetGroup>
  httpListener: LbListener
  httpsListener?: LbListener
}

export function createAlb(
  name: string,
  config: EnvironmentConfig,
  publicSubnets: Ec2Subnet[],
  securityGroup: Ec2SecurityGroup,
  certificateArn?: Output<string>,
): AlbOutput {
  const alb = new aws.lb.LoadBalancer(`${name}-alb`, {
    name: `${name}-alb`,
    internal: false,
    loadBalancerType: "application",
    securityGroups: [securityGroup.id],
    subnets: publicSubnets.map((s) => s.id),
    enableDeletionProtection: config.name === "production",
    tags: {
      Name: `${name}-alb`,
      Environment: config.name,
    },
  })

  const targetGroups: Record<string, LbTargetGroup> = {}

  // bull-board routes to the workers service, so we map "bullBoard" -> "workers" for
  // the service config lookup.
  const domainToService: Record<string, string> = { bullBoard: "workers" }

  for (const domainKey of ["web", "api", "ingest", "bullBoard"] as const) {
    const serviceName = domainToService[domainKey] ?? domainKey
    const serviceConfig = config.ecs.services.find((s) => s.name === serviceName)
    const healthCheckPath = serviceConfig?.healthCheckPath ?? "/health"

    const shortEnv = config.name === "production" ? "prod" : "stg"
    const tgName = `lat-${shortEnv}-${domainKey}-tg`

    targetGroups[domainKey] = new aws.lb.TargetGroup(
      `${name}-${domainKey}-tg`,
      {
        name: tgName,
        port: 8080,
        protocol: "HTTP",
        targetType: "ip",
        vpcId: publicSubnets[0].vpcId,
        healthCheck: {
          enabled: true,
          healthyThreshold: 2,
          interval: 30,
          matcher: "200",
          path: healthCheckPath,
          port: "traffic-port",
          protocol: "HTTP",
          timeout: 5,
          unhealthyThreshold: 3,
        },
        tags: {
          Name: `${name}-${domainKey}-tg`,
          Environment: config.name,
        },
      },
      { deleteBeforeReplace: false },
    )
  }

  const httpListener = new aws.lb.Listener(`${name}-http`, {
    loadBalancerArn: alb.arn,
    port: 80,
    protocol: "HTTP",
    defaultActions: certificateArn
      ? [
          {
            type: "redirect",
            redirect: {
              port: "443",
              protocol: "HTTPS",
              statusCode: "HTTP_301",
            },
          },
        ]
      : [
          {
            type: "forward",
            targetGroupArn: targetGroups.web.arn,
          },
        ],
  })

  let httpsListener: LbListener | undefined

  if (certificateArn) {
    const defaultAction = {
      type: "forward" as const,
      targetGroupArn: targetGroups.web.arn,
    }

    const rules = [
      {
        hostname: config.domains.api,
        targetGroup: targetGroups.api,
      },
      {
        hostname: config.domains.ingest,
        targetGroup: targetGroups.ingest,
      },
      {
        hostname: config.domains.bullBoard,
        targetGroup: targetGroups.bullBoard,
      },
    ]

    httpsListener = new aws.lb.Listener(`${name}-https`, {
      loadBalancerArn: alb.arn,
      port: 443,
      protocol: "HTTPS",
      sslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
      certificateArn: certificateArn,
      defaultActions: [defaultAction],
    })

    const ruleNames = ["api", "ingest", "bull-board"] as const
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i]
      const ruleName = ruleNames[i]
      new aws.lb.ListenerRule(`${name}-${ruleName}-rule`, {
        listenerArn: httpsListener.arn,
        priority: 100 + i,
        actions: [
          {
            type: "forward",
            targetGroupArn: rule.targetGroup.arn,
          },
        ],
        conditions: [
          {
            hostHeader: {
              values: [rule.hostname],
            },
          },
        ],
      })
    }
  }

  return {
    alb,
    targetGroups,
    httpListener,
    httpsListener,
  }
}
