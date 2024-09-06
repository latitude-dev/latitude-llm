const INTERNAL_PACKAGES = [
  '@latitude-data/web-ui',
  '@latitude-data/env',
  '@latitude-data/core',
  '@latitude-data/jobs',
  '@latitude-data/mailers',
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: INTERNAL_PACKAGES,
  experimental: {
    // Dear developer,
    //
    // Unfortunately, our jobs packages uses some meta programming that relies
    // on the name of job handler functions for things to work properly. As you
    // can imagine, minification would break this. So we have to disable it.
    serverMinification: false,
    // TODO: Review this decision. It would be more performant to use
    // direct uploads. To implement it we need to generate a signed URL
    // that's send directly to S3 and the clint upload the file to Amazon directly
    // What I stopped me from implementing is that dev experience would (maybe) be
    // different because in local environment we would need to upload the file to
    // the nextjs server as we do now.
    serverActions: {
      bodySizeLimit: '15mb',
    },
  },
}

export default nextConfig
