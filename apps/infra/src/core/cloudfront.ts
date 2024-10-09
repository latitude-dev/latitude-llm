import * as aws from '@pulumi/aws'

export const usEastProvider = new aws.Provider('us-east-1', {
  region: 'us-east-1',
})

const certificate = new aws.acm.Certificate(
  'latitudeCertificate',
  {
    domainName: 'ai.latitude.so',
    validationMethod: 'DNS',
  },
  { provider: usEastProvider },
)

const redirectFunction = new aws.cloudfront.Function('redirectFunction', {
  code: `
function handler(event) {
    var response = {
        statusCode: 301,
        statusDescription: 'Moved Permanently',
        headers: {
            'location': { value: 'https://latitude.so' + event.request.uri }
        }
    };
    return response;
}
`,
  name: 'redirect-to-latitude',
  runtime: 'cloudfront-js-1.0',
})

const distribution = new aws.cloudfront.Distribution('latitudeRedirect', {
  enabled: true,
  isIpv6Enabled: true,
  httpVersion: 'http2',
  aliases: ['ai.latitude.so'],
  defaultCacheBehavior: {
    allowedMethods: ['GET', 'HEAD'],
    cachedMethods: ['GET', 'HEAD'],
    targetOriginId: 'latitudeOrigin',
    forwardedValues: {
      queryString: false,
      cookies: {
        forward: 'none',
      },
    },
    viewerProtocolPolicy: 'redirect-to-https',
    minTtl: 0,
    defaultTtl: 300,
    maxTtl: 1200,
    functionAssociations: [
      {
        eventType: 'viewer-request',
        functionArn: redirectFunction.arn,
      },
    ],
  },
  origins: [
    {
      domainName: 'latitude.so',
      originId: 'latitudeOrigin',
      customOriginConfig: {
        httpPort: 80,
        httpsPort: 443,
        originSslProtocols: ['TLSv1.2'],
        originProtocolPolicy: 'https-only',
      },
    },
  ],
  restrictions: {
    geoRestriction: {
      restrictionType: 'none',
    },
  },
  viewerCertificate: {
    acmCertificateArn: certificate.arn,
    sslSupportMethod: 'sni-only',
    minimumProtocolVersion: 'TLSv1.2_2021',
  },
})

export const distributionUrl = distribution.domainName

const record = new aws.route53.Record('latitudeRecord', {
  zoneId: 'Z04918046RTZRA6UX0HY',
  name: 'ai.latitude.so',
  type: 'A',
  aliases: [
    {
      name: distribution.domainName,
      zoneId: distribution.hostedZoneId,
      evaluateTargetHealth: false,
    },
  ],
})

export const recordName = record.name
