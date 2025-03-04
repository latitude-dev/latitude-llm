import { HostedIntegrationType } from '@latitude-data/constants'
import { HostedIntegrationConfig } from './types'
import SLACK_MCP_CONFIG from './slack'
import STRIPE_MCP_CONFIG from './stripe'
import GITHUB_MCP_CONFIG from './github'
import NOTION_MCP_CONFIG from './notion'
import TWITTER_MCP_CONFIG from './twitter'
import AIRTABLE_MCP_CONFIG from './airtable'
import LINEAR_MCP_CONFIG from './linear'
import YOUTUBE_CAPTIONS_MCP_CONFIG from './youtubeCaptions'

export const HOSTED_MCP_CONFIGS: Record<
  HostedIntegrationType,
  HostedIntegrationConfig
> = {
  [HostedIntegrationType.Slack]: SLACK_MCP_CONFIG,
  [HostedIntegrationType.Stripe]: STRIPE_MCP_CONFIG,
  [HostedIntegrationType.Github]: GITHUB_MCP_CONFIG,
  [HostedIntegrationType.Notion]: NOTION_MCP_CONFIG,
  [HostedIntegrationType.Twitter]: TWITTER_MCP_CONFIG,
  [HostedIntegrationType.Airtable]: AIRTABLE_MCP_CONFIG,
  [HostedIntegrationType.Linear]: LINEAR_MCP_CONFIG,
  [HostedIntegrationType.YoutubeCaptions]: YOUTUBE_CAPTIONS_MCP_CONFIG,
}
