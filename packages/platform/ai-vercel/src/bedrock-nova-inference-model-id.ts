/**
 * Amazon Nova foundation IDs (`amazon.nova-*`) require a geographic cross-region
 * inference profile ID in many Bedrock regions (`eu.*`, `us.*`, `apac.*`).
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html
 */
const bedrockGeographyPrefixForAwsRegion = (region: string): "eu" | "us" | "apac" => {
  if (region.startsWith("eu-")) {
    return "eu"
  }
  if (region.startsWith("us-") || region.startsWith("ca-") || region.startsWith("sa-") || region.startsWith("mx-")) {
    return "us"
  }
  if (region.startsWith("ap-") || region.startsWith("me-") || region.startsWith("af-")) {
    return "apac"
  }
  if (region.startsWith("il-")) {
    return "eu"
  }
  return "eu"
}

export const resolveAmazonNovaBedrockModelId = (model: string, region: string): string => {
  if (model.startsWith("global.")) {
    return model
  }

  const match = model.match(/^(?:(eu|us|apac)\.)?(amazon\.nova-.+)$/)
  if (!match) {
    return model
  }

  const suffix = match[2]
  const prefix = bedrockGeographyPrefixForAwsRegion(region)
  return `${prefix}.${suffix}`
}
