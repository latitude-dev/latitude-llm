import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

// Configure US East provider for ACM certificates and Lambda@Edge
export const usEastProvider = new aws.Provider('us-east-1', {
  region: 'us-east-1',
})

// =========================================
// SSL Certificates
// =========================================
const certificate = new aws.acm.Certificate(
  'latitudeCertificate',
  {
    domainName: 'ai.latitude.so',
    validationMethod: 'DNS',
  },
  { provider: usEastProvider },
)

const blogCertificate = new aws.acm.Certificate(
  'latitudeBlogCertificate',
  {
    domainName: 'blog.latitude.so',
    validationMethod: 'DNS',
  },
  { provider: usEastProvider },
)

const mainCertificate = new aws.acm.Certificate(
  'latitudeMainCertificate',
  {
    domainName: 'latitude.so',
    validationMethod: 'DNS',
  },
  { provider: usEastProvider },
)

// =========================================
// CloudFront Functions
// =========================================

// Redirect function for ai.latitude.so -> latitude.so
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

// Blog redirect function
const blogRedirectFunction = new aws.cloudfront.Function(
  'blogRedirectFunction',
  {
    code: `
function handler(event) {
    var response = {
        statusCode: 301,
        statusDescription: 'Moved Permanently',
        headers: {
            'location': { value: 'https://latitude.so/blog' + event.request.uri }
        }
    };
    return response;
}
`,
    name: 'redirect-blog-to-latitude',
    runtime: 'cloudfront-js-1.0',
  },
)

// =========================================
// CloudFront Distributions
// =========================================

// Redirect Distribution (ai.latitude.so -> latitude.so)
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

// Main Distribution (latitude.so)
const mainDistribution = new aws.cloudfront.Distribution('latitudeMain', {
  enabled: true,
  isIpv6Enabled: true,
  httpVersion: 'http2',
  aliases: ['latitude.so'],
  // Default behavior for the main site
  defaultCacheBehavior: {
    allowedMethods: ['GET', 'HEAD'],
    cachedMethods: ['GET', 'HEAD'],
    targetOriginId: 'mainOrigin',
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
  },
  // Additional behaviors for specific paths
  orderedCacheBehaviors: [
    {
      // Blog behavior: directly routes to latitude-blog.ghost.io
      pathPattern: '/blog*',
      allowedMethods: ['GET', 'HEAD'],
      cachedMethods: ['GET', 'HEAD'],
      targetOriginId: 'blog',
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
    },
    {
      // Content behavior: also routes to latitude-blog.ghost.io
      pathPattern: '/content*',
      allowedMethods: ['GET', 'HEAD'],
      cachedMethods: ['GET', 'HEAD'],
      targetOriginId: 'blog',
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
    },
    {
      // Public assets behavior: routes to latitude-blog.ghost.io
      pathPattern: '/public*',
      allowedMethods: ['GET', 'HEAD'],
      cachedMethods: ['GET', 'HEAD'],
      targetOriginId: 'blog',
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
    },
    {
      // Assets behavior: routes to latitude-blog.ghost.io
      pathPattern: '/assets*',
      allowedMethods: ['GET', 'HEAD'],
      cachedMethods: ['GET', 'HEAD'],
      targetOriginId: 'blog',
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
    },
  ],
  // Origins configuration
  origins: [
    {
      // Main site origin
      domainName: 'passionate-hours-147463.framer.app',
      originId: 'mainOrigin',
      customOriginConfig: {
        httpPort: 80,
        httpsPort: 443,
        originSslProtocols: ['TLSv1.2'],
        originProtocolPolicy: 'https-only',
      },
    },
    {
      // Blog origin (Ghost.io)
      domainName: 'latitude-blog.ghost.io',
      originId: 'blog',
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
    acmCertificateArn: mainCertificate.arn,
    sslSupportMethod: 'sni-only',
    minimumProtocolVersion: 'TLSv1.2_2021',
  },
})

// Blog Redirect Distribution (blog.latitude.so -> latitude.so/blog)
const blogDistribution = new aws.cloudfront.Distribution(
  'latitudeBlogRedirect',
  {
    enabled: true,
    isIpv6Enabled: true,
    httpVersion: 'http2',
    aliases: ['blog.latitude.so'],
    defaultCacheBehavior: {
      allowedMethods: ['GET', 'HEAD'],
      cachedMethods: ['GET', 'HEAD'],
      targetOriginId: 'latitudeBlogOrigin',
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
          functionArn: blogRedirectFunction.arn,
        },
      ],
    },
    origins: [
      {
        domainName: 'latitude.so',
        originId: 'latitudeBlogOrigin',
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
      acmCertificateArn: blogCertificate.arn,
      sslSupportMethod: 'sni-only',
      minimumProtocolVersion: 'TLSv1.2_2021',
    },
  },
)

// =========================================
// DNS Records
// =========================================
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

// Blog DNS record
const blogRecord = new aws.route53.Record('latitudeBlogRecord', {
  zoneId: 'Z04918046RTZRA6UX0HY',
  name: 'blog.latitude.so',
  type: 'A',
  aliases: [
    {
      name: blogDistribution.domainName,
      zoneId: blogDistribution.hostedZoneId,
      evaluateTargetHealth: false,
    },
  ],
})

// =========================================
// Exports
// =========================================
export const distributionUrl = distribution.domainName
export const recordName = record.name
export const mainDistributionUrl = mainDistribution.domainName
export const blogDistributionUrl = blogDistribution.domainName
