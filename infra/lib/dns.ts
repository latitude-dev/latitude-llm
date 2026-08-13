import * as aws from "@pulumi/aws"
import * as pulumi from "@pulumi/pulumi"
import type { EnvironmentConfig } from "../config.ts"
import type { AcmCertificate, AcmCertificateValidation, LbLoadBalancer, Route53Record } from "./types.ts"

export interface HostedZoneOutput {
  zone: aws.route53.Zone
}

export function createHostedZone(
  name: string,
  config: EnvironmentConfig,
  domainName: string,
): HostedZoneOutput {
  const zone = new aws.route53.Zone(`${name}-${domainName.replace(/\./g, "-")}`, {
    name: domainName,
    tags: {
      Name: `${name}-${domainName}`,
      Environment: config.name,
    },
  })

  return { zone }
}

export interface TryLatitudeDnsOutput {
  records: Record<string, Route53Record>
}

export function createTryLatitudeDnsRecords(
  name: string,
  zone: aws.route53.Zone,
): TryLatitudeDnsOutput {
  const records: Record<string, Route53Record> = {}

  // SPF record for trylatitude.com
  records.spf = new aws.route53.Record(`${name}-trylatitude-spf`, {
    zoneId: zone.zoneId,
    name: "trylatitude.com",
    type: "TXT",
    records: ["v=spf1 include:mailgun.org ~all"],
    ttl: 300,
    allowOverwrite: true,
  })

  // DKIM record for trylatitude.com
  records.dkim = new aws.route53.Record(`${name}-trylatitude-dkim`, {
    zoneId: zone.zoneId,
    name: "s1._domainkey.trylatitude.com",
    type: "TXT",
    records: [
      "k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC956oONZWAzGISHwevlCz5REvD2H/rKfLNpZgumoTikrd+mD4meGMQfdovQavOsbNM03y5Jvc6kV6lu2YdjSm17b9CP+8vv8RhCPTEJQ2t4RSou2fJA97RdkpTDi44rnzyfTD9O2tNngcq2+dPo2moyaj2gXBqG3iWDRmHSgma0QIDAQAB",
    ],
    ttl: 300,
    allowOverwrite: true,
  })

  // CNAME for email.trylatitude.com
  records.emailCname = new aws.route53.Record(`${name}-trylatitude-email-cname`, {
    zoneId: zone.zoneId,
    name: "email.trylatitude.com",
    type: "CNAME",
    records: ["eu.mailgun.org"],
    ttl: 300,
    allowOverwrite: true,
  })

  // MX records for trylatitude.com
  records.mx = new aws.route53.Record(`${name}-trylatitude-mx`, {
    zoneId: zone.zoneId,
    name: "trylatitude.com",
    type: "MX",
    records: ["10 mxa.eu.mailgun.org", "10 mxb.eu.mailgun.org"],
    ttl: 300,
    allowOverwrite: true,
  })

  // DMARC record for trylatitude.com
  records.dmarc = new aws.route53.Record(`${name}-trylatitude-dmarc`, {
    zoneId: zone.zoneId,
    name: "_dmarc.trylatitude.com",
    type: "TXT",
    records: [
      "v=DMARC1; p=none; pct=100; fo=1; ri=3600; rua=mailto:e7f90fe9@dmarc.mailgun.org,mailto:87135eb9@inbox.ondmarc.com,mailto:dmarc@trylatitude.com; ruf=mailto:e7f90fe9@dmarc.mailgun.org,mailto:87135eb9@inbox.ondmarc.com;",
    ],
    ttl: 300,
    allowOverwrite: true,
  })

  return { records }
}

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
    bullBoard: config.domains.bullBoard,
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
    records.docsV1Cname = new aws.route53.Record(`${name}-docs-v1-cname`, {
      zoneId: hostedZoneId,
      name: "docs-v1.latitude.so",
      type: "CNAME",
      records: ["cname.mintlify-dns.com"],
      ttl: 300,
      allowOverwrite: true,
    })

    records.jobsA = new aws.route53.Record(`${name}-jobs-a`, {
      zoneId: hostedZoneId,
      name: "jobs.latitude.so",
      type: "A",
      records: ["54.193.184.88"],
      ttl: 300,
      allowOverwrite: true,
    })

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
    records.notificationsMx = new aws.route53.Record(`${name}-notifications-mx`, {
      zoneId: hostedZoneId,
      name: "notifications.latitude.so",
      type: "MX",
      records: ["10 mxa.eu.mailgun.org", "10 mxb.eu.mailgun.org"],
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

    // CNAME for one-pager.latitude.so -> Vercel
    records.onePagerCname = new aws.route53.Record(`${name}-one-pager-cname`, {
      zoneId: hostedZoneId,
      name: "one-pager.latitude.so",
      type: "CNAME",
      records: ["64cf3fcb81779c8e.vercel-dns-017.com."],
      ttl: 300,
      allowOverwrite: true,
    })

    // Vercel domain verification records
    records.vercelVerification = new aws.route53.Record(`${name}-vercel-verification`, {
      zoneId: hostedZoneId,
      name: "_vercel.latitude.so",
      type: "TXT",
      records: [
        "vc-domain-verify=one-pager.latitude.so,c092b9f764af8a38180d",
        "vc-domain-verify=latitude.so,016a0dbeca8838d547f9",
        "vc-domain-verify=try.latitude.so,caecfef4004b8549d7e7",
      ],
      ttl: 300,
      allowOverwrite: true,
    })

    // A record for latitude.so apex -> Vercel
    records.landingApex = new aws.route53.Record(`${name}-landing-apex`, {
      zoneId: hostedZoneId,
      name: "latitude.so",
      type: "A",
      records: ["216.150.1.1"],
      ttl: 300,
      allowOverwrite: true,
    })

    // CNAME for www.latitude.so -> Vercel
    records.wwwCname = new aws.route53.Record(`${name}-www-cname`, {
      zoneId: hostedZoneId,
      name: "www.latitude.so",
      type: "CNAME",
      records: ["0509d3a779a2765c.vercel-dns-017.com."],
      ttl: 300,
      allowOverwrite: true,
    })

    // CNAME for 41st.latitude.so -> Vercel
    records.fortyFirstCname = new aws.route53.Record(`${name}-41st-cname`, {
      zoneId: hostedZoneId,
      name: "41st.latitude.so",
      type: "CNAME",
      records: ["bb4bb3f03e7ed8d6.vercel-dns-016.com."],
      ttl: 300,
      allowOverwrite: true,
    })

    // CNAME for design.latitude.so -> Vercel
    records.designCname = new aws.route53.Record(`${name}-design-cname`, {
      zoneId: hostedZoneId,
      name: "design.latitude.so",
      type: "CNAME",
      records: ["6ac0d6b5a212d2a5.vercel-dns-016.com."],
      ttl: 300,
      allowOverwrite: true,
    })

    // CNAME for go.latitude.so -> customers.withbaker.com
    records.goCname = new aws.route53.Record(`${name}-go-cname`, {
      zoneId: hostedZoneId,
      name: "go.latitude.so",
      type: "CNAME",
      records: ["customers.withbaker.com"],
      ttl: 300,
      allowOverwrite: true,
    })

    // CNAME for try.latitude.so -> Dub
    records.tryCname = new aws.route53.Record(`${name}-try-cname`, {
      zoneId: hostedZoneId,
      name: "try.latitude.so",
      type: "CNAME",
      records: ["cname.dub.co"],
      ttl: 86400,
      allowOverwrite: true,
    })

    // DNS for AI Discovery (DNS-AID) — draft-mozleywilliams-dnsop-dnsaid.
    // Publishes Latitude's MCP agent endpoint under the _agents namespace so
    // AI agents can discover it via SVCB records (RFC 9460). The _mcp label
    // advertises the MCP protocol endpoint; _index is the well-known
    // organizational entry point. Both point at the production API which hosts
    // the MCP transport at /v1/mcp.
    records.dnsAidMcp = new aws.route53.Record(`${name}-dns-aid-mcp`, {
      zoneId: hostedZoneId,
      name: "_mcp._agents.latitude.so",
      type: "SVCB",
      records: ["1 api.latitude.so. alpn=mcp,h2 port=443 mandatory=alpn,port"],
      ttl: 3600,
      allowOverwrite: true,
    })

    records.dnsAidIndex = new aws.route53.Record(`${name}-dns-aid-index`, {
      zoneId: hostedZoneId,
      name: "_index._agents.latitude.so",
      type: "SVCB",
      records: ["1 api.latitude.so. alpn=mcp,h2 port=443 mandatory=alpn,port"],
      ttl: 3600,
      allowOverwrite: true,
    })
  }

  return {
    records,
  }
}

export interface DnssecOutput {
  keySigningKey: aws.route53.KeySigningKey
  dsRecord: pulumi.Output<string>
}

// Enables DNSSEC signing on the latitude.so hosted zone so that validating
// resolvers return authenticated data for DNS-AID records (RFC 9364). Route 53
// DNSSEC requires the KMS key to live in us-east-1, so a provider alias is
// created for that region regardless of the stack's home region. The DS record
// emitted by the KSK must be published in the parent zone (.so) to complete the
// chain of trust. latitude.so is registered at Namecheap (.so TLD is not
// supported by AWS Route 53 Domains), so the DS record goes into Namecheap's
// DNSSEC panel — see Pulumi.production.yaml for instructions.
export function createDnssecSigning(name: string, hostedZoneId: string): DnssecOutput {
  const usEast1 = new aws.Provider(`${name}-us-east-1`, { region: "us-east-1" })

  const callerIdentity = aws.getCallerIdentityOutput({}, { provider: usEast1 })

  const kmsKey = new aws.kms.Key(
    `${name}-dnssec-ksk`,
    {
      customerMasterKeySpec: "ECC_NIST_P256",
      deletionWindowInDays: 7,
      keyUsage: "SIGN_VERIFY",
      policy: pulumi.jsonStringify({
        Statement: [
          {
            Sid: "Allow Route 53 DNSSEC Service",
            Action: ["kms:DescribeKey", "kms:GetPublicKey", "kms:Sign"],
            Effect: "Allow",
            Principal: { Service: "dnssec-route53.amazonaws.com" },
            Resource: "*",
            Condition: {
              StringEquals: { "aws:SourceAccount": callerIdentity.accountId },
              ArnLike: { "aws:SourceArn": "arn:aws:route53:::hostedzone/*" },
            },
          },
          {
            Sid: "Allow Route 53 DNSSEC Service to CreateGrant",
            Action: "kms:CreateGrant",
            Effect: "Allow",
            Principal: { Service: "dnssec-route53.amazonaws.com" },
            Resource: "*",
            Condition: { Bool: { "kms:GrantIsForAWSResource": "true" } },
          },
          {
            Sid: "Enable IAM User Permissions",
            Action: "kms:*",
            Effect: "Allow",
            Principal: { AWS: pulumi.interpolate`arn:aws:iam::${callerIdentity.accountId}:root` },
            Resource: "*",
          },
        ],
        Version: "2012-10-17",
      }),
    },
    { provider: usEast1 },
  )

  const keySigningKey = new aws.route53.KeySigningKey(`${name}-dnssec-ksk`, {
    hostedZoneId,
    keyManagementServiceArn: kmsKey.arn,
    name: "latitude-dnssec",
  })

  new aws.route53.HostedZoneDnsSec(
    `${name}-dnssec-signing`,
    {
      hostedZoneId,
      signingStatus: "SIGNING",
    },
    { dependsOn: [keySigningKey] },
  )

  return {
    keySigningKey,
    dsRecord: keySigningKey.dsRecord,
  }
}
