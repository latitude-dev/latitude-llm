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

  // SPF and DKIM records for production email domain
  if (config.name === "production") {
    // SPF record for notifications.latitude.so
    records.notificationsSpf = new aws.route53.Record(`${name}-notifications-spf`, {
      zoneId: hostedZoneId,
      name: "notifications.latitude.so",
      type: "TXT",
      records: ["v=spf1 include:mailgun.org ~all"],
      ttl: 300,
      allowOverwrite: true,
    })

    // DKIM record for notifications.latitude.so
    records.notificationsDkim = new aws.route53.Record(`${name}-notifications-dkim`, {
      zoneId: hostedZoneId,
      name: "email._domainkey.notifications.latitude.so",
      type: "TXT",
      records: [
        "k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC4H4pcHx6bbjEPdjStYEll3wdeZyBXGkDwcQWqeP++haHsLthrHlVzD88eCXZv8PS8R44ZM1y1j617RVwz+Eygxrb4q66DacZKYiYUEEbFJ4CcPR59Mic21vHHU3xLad5Ms7EKp2UkCNdK3qbWp8MD12OepLl2ZCzhXt7gdAZDRQIDAQAB",
      ],
      ttl: 300,
      allowOverwrite: true,
    })

    // MX records for notifications.latitude.so
    records.notificationsMx1 = new aws.route53.Record(`${name}-notifications-mx1`, {
      zoneId: hostedZoneId,
      name: "notifications.latitude.so",
      type: "MX",
      records: ["10 mxa.eu.mailgun.org"],
      ttl: 300,
      allowOverwrite: true,
    })

    records.notificationsMx2 = new aws.route53.Record(`${name}-notifications-mx2`, {
      zoneId: hostedZoneId,
      name: "notifications.latitude.so",
      type: "MX",
      records: ["10 mxb.eu.mailgun.org"],
      ttl: 300,
      allowOverwrite: true,
    })

    // CNAME for email.notifications.latitude.so
    records.notificationsCname = new aws.route53.Record(`${name}-notifications-cname`, {
      zoneId: hostedZoneId,
      name: "email.notifications.latitude.so",
      type: "CNAME",
      records: ["eu.mailgun.org"],
      ttl: 300,
      allowOverwrite: true,
    })

    // DMARC record for notifications.latitude.so
    records.notificationsDmarc = new aws.route53.Record(`${name}-notifications-dmarc`, {
      zoneId: hostedZoneId,
      name: "_dmarc.notifications.latitude.so",
      type: "TXT",
      records: [
        "v=DMARC1; p=none; pct=100; fo=1; ri=3600; rua=mailto:e0c20fc1@dmarc.mailgun.org,mailto:0201067b@inbox.ondmarc.com; ruf=mailto:e0c20fc1@dmarc.mailgun.org,mailto:0201067b@inbox.ondmarc.com;",
      ],
      ttl: 300,
      allowOverwrite: true,
    })
  }

  return {
    records,
  }
}
