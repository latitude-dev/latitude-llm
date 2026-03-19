import * as aws from "@pulumi/aws"
import type { EnvironmentConfig } from "../config.ts"
import type { AcmCertificate, AcmCertificateValidation, LbLoadBalancer, Route53Record } from "./types.ts"

export interface CertificateOutput {
  certificate: AcmCertificate
  certificateValidation?: AcmCertificateValidation
}

export function createCertificate(
  name: string,
  config: EnvironmentConfig,
  hostedZoneId: string,
  domainName: string,
): CertificateOutput {
  const certDomain = config.name === "staging" ? `*.${domainName}` : domainName
  const subjectAltNames =
    config.name === "production"
      ? [`*.${domainName}`, config.domains.web, config.domains.api, config.domains.ingest]
      : undefined

  const certificate = new aws.acm.Certificate(`${name}-cert`, {
    domainName: certDomain,
    subjectAlternativeNames: subjectAltNames,
    validationMethod: "DNS",
    tags: {
      Name: `${name}-cert`,
      Environment: config.name,
    },
  })

  let certificateValidation: AcmCertificateValidation | undefined

  if (config.name === "production") {
    const validationRecords = certificate.domainValidationOptions.apply((options) =>
      options.map(
        (opt, i) =>
          new aws.route53.Record(`${name}-cert-validation-${i}`, {
            zoneId: hostedZoneId,
            name: opt.resourceRecordName,
            type: opt.resourceRecordType,
            records: [opt.resourceRecordValue],
            ttl: 60,
            allowOverwrite: true,
          }),
      ),
    )

    certificateValidation = new aws.acm.CertificateValidation(`${name}-cert-validation`, {
      certificateArn: certificate.arn,
      validationRecordFqdns: validationRecords.apply((records) => records.map((r) => r.fqdn)),
    })
  }

  return {
    certificate,
    certificateValidation,
  }
}

export interface DnsOutput {
  records: Record<string, Route53Record>
}

export function createDnsRecords(
  name: string,
  config: EnvironmentConfig,
  alb: LbLoadBalancer,
  hostedZoneId: string,
): DnsOutput {
  const records: Record<string, Route53Record> = {}

  const domains = {
    web: config.domains.web,
    api: config.domains.api,
    ingest: config.domains.ingest,
  }

  for (const [key, domain] of Object.entries(domains)) {
    records[key] = new aws.route53.Record(`${name}-${key}-record`, {
      zoneId: hostedZoneId,
      name: domain,
      type: "A",
      aliases: [
        {
          name: alb.dnsName,
          zoneId: alb.zoneId,
          evaluateTargetHealth: true,
        },
      ],
      allowOverwrite: true,
    })
  }

  return {
    records,
  }
}
