/**
 * Some Bedrock foundation model IDs must be invoked via a geographic inference
 * profile ID (`{eu|us|apac}.*`) rather than on-demand throughput on the bare
 * foundation ID. This applies to Amazon Nova (`amazon.nova-*`) and to certain
 * Anthropic Claude releases (see {@link ANTHROPIC_BEDROCK_FOUNDATION_IDS_REQUIRING_INFERENCE_PROFILE}).
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

/**
 * Bare foundation IDs that Bedrock rejects for on-demand throughput; callers
 * must use a regional inference profile ID (`{prefix}.{id}`).
 */
const ANTHROPIC_BEDROCK_FOUNDATION_IDS_REQUIRING_INFERENCE_PROFILE = new Set<string>([
  "anthropic.claude-opus-4-6-v1",
  "anthropic.claude-sonnet-4-6",
  "anthropic.claude-haiku-4-5-20251001-v1:0",
])

/**
 * Resolves configured Bedrock model identifiers to IDs Bedrock accepts in the
 * caller's region (Nova cross-region profiles, Anthropic inference profiles).
 */
export const resolveAmazonBedrockModelId = (model: string, region: string): string => {
  if (model.startsWith("global.")) {
    return model
  }

  const novaMatch = model.match(/^(?:(eu|us|apac)\.)?(amazon\.nova-.+)$/)
  if (novaMatch) {
    const suffix = novaMatch[2]
    const prefix = bedrockGeographyPrefixForAwsRegion(region)
    return `${prefix}.${suffix}`
  }

  if (ANTHROPIC_BEDROCK_FOUNDATION_IDS_REQUIRING_INFERENCE_PROFILE.has(model)) {
    const prefix = bedrockGeographyPrefixForAwsRegion(region)
    return `${prefix}.${model}`
  }

  return model
}
