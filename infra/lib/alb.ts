import * as aws from "@pulumi/aws"
import type { Output } from "@pulumi/pulumi"
import type { EnvironmentConfig } from "../config.ts"
import type { Ec2SecurityGroup, Ec2Subnet, LbListener, LbLoadBalancer, LbTargetGroup } from "./types.ts"

const STATUS_PAGE_URL = "https://status.latitude.so/"

export interface TargetGroupPair {
  blue: LbTargetGroup
  green: LbTargetGroup
}

export interface AlbOutput {
  alb: LbLoadBalancer
  targetGroups: Record<string, TargetGroupPair>
  httpListener: LbListener
  httpsListener?: LbListener
}

export function createAlb(
  name: string,
  config: EnvironmentConfig,
  publicSubnets: Ec2Subnet[],
  securityGroup: Ec2SecurityGroup,
  certificateArn?: Output<string>,
  enableMaintenanceRedirect = false,
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

  const targetGroups: Record<string, TargetGroupPair> = {}

  // bull-board routes to the workers service, so we map "bullBoard" -> "workers" for
  // the service config lookup.
  const domainToService: Record<string, string> = { bullBoard: "workers" }

  for (const domainKey of ["web", "api", "ingest", "bullBoard"] as const) {
    const serviceName = domainToService[domainKey] ?? domainKey
    const serviceConfig = config.ecs.services.find((s) => s.name === serviceName)
    const healthCheckPath = serviceConfig?.healthCheckPath ?? "/health"

    const shortEnv = config.name === "production" ? "prod" : "stg"
    const blueName = `lat-${shortEnv}-${domainKey}-tg`
    const greenName = `lat-${shortEnv}-${domainKey}-grn`

    const targetGroupArgs = {
      port: 8080,
      protocol: "HTTP" as const,
      targetType: "ip" as const,
      vpcId: publicSubnets[0].vpcId,
      healthCheck: {
        enabled: true,
        healthyThreshold: 2,
        interval: 30,
        matcher: "200",
        path: healthCheckPath,
        port: "traffic-port",
        protocol: "HTTP" as const,
        timeout: 5,
        unhealthyThreshold: 3,
      },
    }

    const blue = new aws.lb.TargetGroup(
      `${name}-${domainKey}-tg`,
      {
        ...targetGroupArgs,
        name: blueName,
        tags: {
          Name: `${name}-${domainKey}-tg`,
          Environment: config.name,
          DeploymentColor: "blue",
        },
      },
      { deleteBeforeReplace: false },
    )

    const green = new aws.lb.TargetGroup(
      `${name}-${domainKey}-tg-green`,
      {
        ...targetGroupArgs,
        name: greenName,
        tags: {
          Name: `${name}-${domainKey}-tg-green`,
          Environment: config.name,
          DeploymentColor: "green",
        },
      },
      { deleteBeforeReplace: false },
    )

    targetGroups[domainKey] = { blue, green }
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
            targetGroupArn: targetGroups.web.blue.arn,
          },
        ],
  })

  let httpsListener: LbListener | undefined

  if (certificateArn) {
    const createServiceActions = (targetGroup: LbTargetGroup) =>
      enableMaintenanceRedirect ? createStatusPageRedirectActions() : createForwardActions(targetGroup)

    const defaultActions = createServiceActions(targetGroups.web.blue)

    const rules = [
      {
        hostname: config.domains.api,
        actions: createServiceActions(targetGroups.api.blue),
      },
      {
        hostname: config.domains.ingest,
        actions: createServiceActions(targetGroups.ingest.blue),
      },
      {
        hostname: config.domains.bullBoard,
        actions: createServiceActions(targetGroups.bullBoard.blue),
      },
    ]

    httpsListener = new aws.lb.Listener(`${name}-https`, {
      loadBalancerArn: alb.arn,
      port: 443,
      protocol: "HTTPS",
      sslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
      certificateArn: certificateArn,
      defaultActions,
    })

    const ruleNames = ["api", "ingest", "bull-board"] as const
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i]
      const ruleName = ruleNames[i]
      new aws.lb.ListenerRule(`${name}-${ruleName}-rule`, {
        listenerArn: httpsListener.arn,
        priority: 100 + i,
        actions: rule.actions,
        conditions: [
          {
            hostHeader: {
              values: [rule.hostname],
            },
          },
        ],
      })
    }

    if (enableMaintenanceRedirect) {
      const associationRules = [
        { ruleName: "web-target-group-association", targetGroup: targetGroups.web.blue },
        { ruleName: "api-target-group-association", targetGroup: targetGroups.api.blue },
        { ruleName: "ingest-target-group-association", targetGroup: targetGroups.ingest.blue },
        { ruleName: "bull-board-target-group-association", targetGroup: targetGroups.bullBoard.blue },
      ]

      for (let i = 0; i < associationRules.length; i++) {
        const rule = associationRules[i]
        new aws.lb.ListenerRule(`${name}-${rule.ruleName}-rule`, {
          listenerArn: httpsListener.arn,
          priority: 200 + i,
          actions: createForwardActions(rule.targetGroup),
          conditions: [
            {
              hostHeader: {
                values: [`${rule.ruleName}.maintenance.local`],
              },
            },
          ],
        })
      }
    }
  }

  return {
    alb,
    targetGroups,
    httpListener,
    httpsListener,
  }
}

function createForwardActions(targetGroup: LbTargetGroup) {
  return [
    {
      type: "forward" as const,
      targetGroupArn: targetGroup.arn,
    },
  ]
}

function createStatusPageRedirectActions() {
  return [
    {
      type: "redirect" as const,
      redirect: createRedirectAction(STATUS_PAGE_URL),
    },
  ]
}

function createRedirectAction(url: string) {
  const target = new URL(url)

  return {
    protocol: target.protocol.replace(":", "").toUpperCase(),
    host: target.hostname,
    port: target.port || (target.protocol === "https:" ? "443" : "80"),
    path: `/${target.pathname.replace(/^\//, "")}`,
    query: target.search.replace(/^\?/, ""),
    statusCode: "HTTP_302" as const,
  }
}
