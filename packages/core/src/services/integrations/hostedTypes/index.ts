import { HostedIntegrationType } from '@latitude-data/constants'
import { HostedIntegrationConfig } from './types'
import SLACK_MCP_CONFIG from './configs/slack'
import STRIPE_MCP_CONFIG from './configs/stripe'
import GITHUB_MCP_CONFIG from './configs/github'
import NOTION_MCP_CONFIG from './configs/notion'
import TWITTER_MCP_CONFIG from './configs/twitter'
import AIRTABLE_MCP_CONFIG from './configs/airtable'
import LINEAR_MCP_CONFIG from './configs/linear'
import YOUTUBE_CAPTIONS_MCP_CONFIG from './configs/youtubeCaptions'
import REDDIT_MCP_CONFIG from './configs/reddit'
import TELEGRAM_MCP_CONFIG from './configs/telegram'
import TINYBIRD_MCP_CONFIG from './configs/tinybird'
import PERPLEXITY_MCP_CONFIG from './configs/perplexity'
import AWS_KB_RETRIEVAL_MCP_CONFIG from './configs/awsKbRetrieval'
import BRAVE_SEARCH_MCP_CONFIG from './configs/braveSearch'
import EVER_ART_MCP_CONFIG from './configs/everart'
import FETCH_MCP_CONFIG from './configs/fetch'
import GITLAB_MCP_CONFIG from './configs/gitlab'
import GOOGLE_MAPS_MCP_CONFIG from './configs/googleMaps'
import MEMORY_MCP_CONFIG from './configs/memory'
import PUPPETEER_MCP_CONFIG from './configs/puppeteer'
import SENTRY_MCP_CONFIG from './configs/sentry'
import SEQUENTIAL_THINKING_MCP_CONFIG from './configs/sequentialThinking'
import TIME_MCP_CONFIG from './configs/time'

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
  [HostedIntegrationType.Reddit]: REDDIT_MCP_CONFIG,
  [HostedIntegrationType.Telegram]: TELEGRAM_MCP_CONFIG,
  [HostedIntegrationType.Tinybird]: TINYBIRD_MCP_CONFIG,
  [HostedIntegrationType.Perplexity]: PERPLEXITY_MCP_CONFIG,
  [HostedIntegrationType.AwsKbRetrieval]: AWS_KB_RETRIEVAL_MCP_CONFIG,
  [HostedIntegrationType.BraveSearch]: BRAVE_SEARCH_MCP_CONFIG,
  [HostedIntegrationType.EverArt]: EVER_ART_MCP_CONFIG,
  [HostedIntegrationType.Fetch]: FETCH_MCP_CONFIG,
  [HostedIntegrationType.GitLab]: GITLAB_MCP_CONFIG,
  [HostedIntegrationType.GoogleMaps]: GOOGLE_MAPS_MCP_CONFIG,
  [HostedIntegrationType.Memory]: MEMORY_MCP_CONFIG,
  [HostedIntegrationType.Puppeteer]: PUPPETEER_MCP_CONFIG,
  [HostedIntegrationType.Sentry]: SENTRY_MCP_CONFIG,
  [HostedIntegrationType.SequentialThinking]: SEQUENTIAL_THINKING_MCP_CONFIG,
  [HostedIntegrationType.Time]: TIME_MCP_CONFIG,
}
