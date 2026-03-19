import * as aws from "@pulumi/aws"
import * as pulumi from "@pulumi/pulumi"
import type { EnvironmentConfig } from "../config.ts"
import type {
  CloudwatchDashboard,
  CloudwatchMetricAlarm,
  EcsCluster,
  LbLoadBalancer,
  RdsCluster,
  RdsInstance,
  SnsTopic,
} from "./types.ts"

export interface ObservabilityOutput {
  dashboard: CloudwatchDashboard
  alarms: Record<string, CloudwatchMetricAlarm>
  snsTopic: SnsTopic
}

export interface RdsResource {
  cluster?: RdsCluster
  instance?: RdsInstance
}

export function createObservability(
  name: string,
  config: EnvironmentConfig,
  cluster: EcsCluster,
  alb: LbLoadBalancer,
  rds: RdsResource,
  alertEmail: string,
): ObservabilityOutput {
  const snsTopic = new aws.sns.Topic(`${name}-alerts`, {
    name: `${name}-alerts`,
    tags: {
      Name: `${name}-alerts`,
      Environment: config.name,
    },
  })

  new aws.sns.TopicSubscription(`${name}-email-subscription`, {
    topic: snsTopic.arn,
    protocol: "email",
    endpoint: alertEmail,
  })

  const rdsArn = rds.cluster?.arn ?? rds.instance!.arn
  const rdsId = rds.cluster?.id ?? rds.instance!.id
  const isAurora = !!rds.cluster

  const dashboard = new aws.cloudwatch.Dashboard(`${name}-dashboard`, {
    dashboardName: `${name}-dashboard`,
    dashboardBody: pulumi.all([cluster.name, alb.arnSuffix, rdsArn]).apply(([clusterName, albArnSuffix, arn]) => {
      const rdsIdentifier = arn.split(":").pop() ?? ""
      const widgets: unknown[] = [
        {
          type: "metric",
          x: 0,
          y: 0,
          width: 12,
          height: 6,
          properties: {
            title: "ECS CPU Utilization",
            view: "timeSeries",
            stacked: false,
            metrics: [
              [
                "AWS/ECS",
                "CPUUtilization",
                "ServiceName",
                `${name}-web`,
                "ClusterName",
                clusterName,
                { stat: "Average", period: 60 },
              ],
              [
                "AWS/ECS",
                "CPUUtilization",
                "ServiceName",
                `${name}-api`,
                "ClusterName",
                clusterName,
                { stat: "Average", period: 60 },
              ],
              [
                "AWS/ECS",
                "CPUUtilization",
                "ServiceName",
                `${name}-ingest`,
                "ClusterName",
                clusterName,
                { stat: "Average", period: 60 },
              ],
              [
                "AWS/ECS",
                "CPUUtilization",
                "ServiceName",
                `${name}-workers`,
                "ClusterName",
                clusterName,
                { stat: "Average", period: 60 },
              ],
            ],
            region: config.region,
          },
        },
        {
          type: "metric",
          x: 12,
          y: 0,
          width: 12,
          height: 6,
          properties: {
            title: "ECS Memory Utilization",
            view: "timeSeries",
            stacked: false,
            metrics: [
              [
                "AWS/ECS",
                "MemoryUtilization",
                "ServiceName",
                `${name}-web`,
                "ClusterName",
                clusterName,
                { stat: "Average", period: 60 },
              ],
              [
                "AWS/ECS",
                "MemoryUtilization",
                "ServiceName",
                `${name}-api`,
                "ClusterName",
                clusterName,
                { stat: "Average", period: 60 },
              ],
              [
                "AWS/ECS",
                "MemoryUtilization",
                "ServiceName",
                `${name}-ingest`,
                "ClusterName",
                clusterName,
                { stat: "Average", period: 60 },
              ],
              [
                "AWS/ECS",
                "MemoryUtilization",
                "ServiceName",
                `${name}-workers`,
                "ClusterName",
                clusterName,
                { stat: "Average", period: 60 },
              ],
            ],
            region: config.region,
          },
        },
        {
          type: "metric",
          x: 0,
          y: 6,
          width: 12,
          height: 6,
          properties: {
            title: "ALB Request Count",
            view: "timeSeries",
            stacked: false,
            metrics: [
              ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", albArnSuffix, { stat: "Sum", period: 60 }],
            ],
            region: config.region,
          },
        },
        {
          type: "metric",
          x: 12,
          y: 6,
          width: 12,
          height: 6,
          properties: {
            title: "ALB 5XX Errors",
            view: "timeSeries",
            stacked: false,
            metrics: [
              [
                "AWS/ApplicationELB",
                "HTTPCode_Target_5XX_Count",
                "LoadBalancer",
                albArnSuffix,
                { stat: "Sum", period: 60 },
              ],
            ],
            region: config.region,
          },
        },
        {
          type: "metric",
          x: 0,
          y: 12,
          width: 12,
          height: 6,
          properties: {
            title: "RDS Connections",
            view: "timeSeries",
            stacked: false,
            metrics: [
              [
                "AWS/RDS",
                "DatabaseConnections",
                isAurora ? "DBClusterIdentifier" : "DBInstanceIdentifier",
                rdsIdentifier,
                { stat: "Average", period: 60 },
              ],
            ],
            region: config.region,
          },
        },
      ]

      if (isAurora) {
        widgets.push({
          type: "metric",
          x: 12,
          y: 12,
          width: 12,
          height: 6,
          properties: {
            title: "RDS ACU Utilization",
            view: "timeSeries",
            stacked: false,
            metrics: [
              ["AWS/RDS", "ACUUtilization", "DBClusterIdentifier", rdsIdentifier, { stat: "Average", period: 60 }],
            ],
            region: config.region,
          },
        })
      }

      return JSON.stringify({ widgets })
    }),
  })

  const alarms: Record<string, CloudwatchMetricAlarm> = {}

  alarms["high-cpu"] = new aws.cloudwatch.MetricAlarm(`${name}-high-cpu-alarm`, {
    name: `${name}-high-cpu-alarm`,
    comparisonOperator: "GreaterThanThreshold",
    evaluationPeriods: 3,
    metricName: "CPUUtilization",
    namespace: "AWS/ECS",
    period: 60,
    statistic: "Average",
    threshold: 80,
    treatMissingData: "notBreaching",
    alarmActions: [snsTopic.arn],
    dimensions: {
      ClusterName: cluster.name,
    },
    tags: {
      Name: `${name}-high-cpu-alarm`,
      Environment: config.name,
    },
  })

  alarms["alb-5xx"] = new aws.cloudwatch.MetricAlarm(`${name}-alb-5xx-alarm`, {
    name: `${name}-alb-5xx-alarm`,
    comparisonOperator: "GreaterThanThreshold",
    evaluationPeriods: 2,
    metricName: "HTTPCode_Target_5XX_Count",
    namespace: "AWS/ApplicationELB",
    period: 60,
    statistic: "Sum",
    threshold: 10,
    treatMissingData: "notBreaching",
    alarmActions: [snsTopic.arn],
    dimensions: {
      LoadBalancer: alb.arnSuffix,
    },
    tags: {
      Name: `${name}-alb-5xx-alarm`,
      Environment: config.name,
    },
  })

  alarms["rds-connections"] = new aws.cloudwatch.MetricAlarm(`${name}-rds-connections-alarm`, {
    name: `${name}-rds-connections-alarm`,
    comparisonOperator: "GreaterThanThreshold",
    evaluationPeriods: 3,
    metricName: "DatabaseConnections",
    namespace: "AWS/RDS",
    period: 60,
    statistic: "Average",
    threshold: 50,
    treatMissingData: "notBreaching",
    alarmActions: [snsTopic.arn],
    dimensions: {
      [isAurora ? "DBClusterIdentifier" : "DBInstanceIdentifier"]: rdsId,
    },
    tags: {
      Name: `${name}-rds-connections-alarm`,
      Environment: config.name,
    },
  })

  return {
    dashboard,
    alarms,
    snsTopic,
  }
}
