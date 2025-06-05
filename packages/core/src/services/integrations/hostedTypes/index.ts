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
import PUPPETEER_MCP_CONFIG from './configs/puppeteer'
import SENTRY_MCP_CONFIG from './configs/sentry'
import TIME_MCP_CONFIG from './configs/time'
import browserbase_MCP_CONFIG from './configs/browserbase'
import NEON_MCP_CONFIG from './configs/neon'
import POSTGRES_MCP_CONFIG from './configs/postgres'
import REDIS_MCP_CONFIG from './configs/redis'
import JIRA_MCP_CONFIG from './configs/jira'
import ATTIO_MCP_CONFIG from './configs/attio'
import GHOST_MCP_CONFIG from './configs/ghost'
import FIGMA_MCP_CONFIG from './configs/figma'
import HYPERBROWSER_MCP_CONFIG from './configs/hyperbrowser'
import AUDIENSE_MCP_CONFIG from './configs/audiense'
import APIFY_MCP_CONFIG from './configs/apify'
import EXA_MCP_CONFIG from './configs/exa'
import YEPCODE_MCP_CONFIG from './configs/yepcode'
import MONDAY_MCP_CONFIG from './configs/monday'
import SUPABASE_MCP_CONFIG from './configs/supabase'
import AGENTQL_MCP_CONFIG from './configs/agentql'
import AGENTRPC_MCP_CONFIG from './configs/agentrpc'
import ASTRADB_MCP_CONFIG from './configs/astraDb'
import BANKLESS_MCP_CONFIG from './configs/bankless'
import BICSCAN_MCP_CONFIG from './configs/bicscan'
import CHARGEBEE_MCP_CONFIG from './configs/chargebee'
import CHRONULUS_MCP_CONFIG from './configs/chronulus'
import CIRCLECI_MCP_CONFIG from './configs/circleci'
import CODACY_MCP_CONFIG from './configs/codacy'
import CODELOGIC_MCP_CONFIG from './configs/codelogic'
import CONVEX_MCP_CONFIG from './configs/convex'
import DART_MCP_CONFIG from './configs/dart'
import DEVHUB_CMS_MCP_CONFIG from './configs/devhubCms'
import ELASTICSEARCH_MCP_CONFIG from './configs/elasticsearch'
import ESIGNATURES_MCP_CONFIG from './configs/esignatures'
import FEWSATS_MCP_CONFIG from './configs/fewsats'
import FIRECRAWL_MCP_CONFIG from './configs/firecrawl'
import GRAPHLIT_MCP_CONFIG from './configs/graphlit'
import HEROKU_MCP_CONFIG from './configs/heroku'
import INTEGRATION_APP_HUBSPOT_MCP_CONFIG from './configs/integrationAppHubspot'
import LARA_TRANSLATE_MCP_CONFIG from './configs/laraTranslate'
import LOGFIRE_MCP_CONFIG from './configs/logfire'
import LANGFUSE_MCP_CONFIG from './configs/langfuse'
import SUPABASE_LINGO_MCP_CONFIG from './configs/lingoSupabase'
import MAKE_MCP_CONFIG from './configs/make'
import MEILISEARCH_MCP_CONFIG from './configs/meilisearch'
import MOMENTO_MCP_CONFIG from './configs/momento'
import NEO4J_AURA_MCP_CONFIG from './configs/neo4jAura'
import OCTAGON_MCP_CONFIG from './configs/octagon'
import PADDLE_MCP_CONFIG from './configs/paddle'
import PAYPAL_MCP_CONFIG from './configs/paypal'
import QDRANT_MCP_CONFIG from './configs/qdrant'
import RAYGUN_MCP_CONFIG from './configs/raygun'
import REMBER_MCP_CONFIG from './configs/rember'
import RIZA_MCP_CONFIG from './configs/riza'
import SEARCH1API_MCP_CONFIG from './configs/search1api'
import SEMGREP_MCP_CONFIG from './configs/semgrep'
import TAVILY_MCP_CONFIG from './configs/tavily'
import UNSTRUCTURED_MCP_CONFIG from './configs/unstructured'
import VECTORIZE_MCP_CONFIG from './configs/vectorize'
import XERO_MCP_CONFIG from './configs/xero'
import READWISE_MCP_CONFIG from './configs/readwise'
import AIRBNB_MCP_CONFIG from './configs/airbnb'
import MINTLIFY_MCP_CONFIG from './configs/mintlify'

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
  [HostedIntegrationType.Puppeteer]: PUPPETEER_MCP_CONFIG,
  [HostedIntegrationType.Sentry]: SENTRY_MCP_CONFIG,
  [HostedIntegrationType.Time]: TIME_MCP_CONFIG,
  [HostedIntegrationType.browserbase]: browserbase_MCP_CONFIG,
  [HostedIntegrationType.Neon]: NEON_MCP_CONFIG,
  [HostedIntegrationType.Postgres]: POSTGRES_MCP_CONFIG,
  [HostedIntegrationType.Supabase]: SUPABASE_MCP_CONFIG,
  [HostedIntegrationType.Redis]: REDIS_MCP_CONFIG,
  [HostedIntegrationType.Jira]: JIRA_MCP_CONFIG,
  [HostedIntegrationType.Attio]: ATTIO_MCP_CONFIG,
  [HostedIntegrationType.Ghost]: GHOST_MCP_CONFIG,
  [HostedIntegrationType.Figma]: FIGMA_MCP_CONFIG,
  [HostedIntegrationType.Hyperbrowser]: HYPERBROWSER_MCP_CONFIG,
  [HostedIntegrationType.Audiense]: AUDIENSE_MCP_CONFIG,
  [HostedIntegrationType.Apify]: APIFY_MCP_CONFIG,
  [HostedIntegrationType.Exa]: EXA_MCP_CONFIG,
  [HostedIntegrationType.YepCode]: YEPCODE_MCP_CONFIG,
  [HostedIntegrationType.Monday]: MONDAY_MCP_CONFIG,
  [HostedIntegrationType.AgentQL]: AGENTQL_MCP_CONFIG,
  [HostedIntegrationType.AgentRPC]: AGENTRPC_MCP_CONFIG,
  [HostedIntegrationType.AstraDB]: ASTRADB_MCP_CONFIG,
  [HostedIntegrationType.Bankless]: BANKLESS_MCP_CONFIG,
  [HostedIntegrationType.Bicscan]: BICSCAN_MCP_CONFIG,
  [HostedIntegrationType.Chargebee]: CHARGEBEE_MCP_CONFIG,
  [HostedIntegrationType.Chronulus]: CHRONULUS_MCP_CONFIG,
  [HostedIntegrationType.CircleCI]: CIRCLECI_MCP_CONFIG,
  [HostedIntegrationType.Codacy]: CODACY_MCP_CONFIG,
  [HostedIntegrationType.CodeLogic]: CODELOGIC_MCP_CONFIG,
  [HostedIntegrationType.Convex]: CONVEX_MCP_CONFIG,
  [HostedIntegrationType.Dart]: DART_MCP_CONFIG,
  [HostedIntegrationType.DevHubCMS]: DEVHUB_CMS_MCP_CONFIG,
  [HostedIntegrationType.Elasticsearch]: ELASTICSEARCH_MCP_CONFIG,
  [HostedIntegrationType.ESignatures]: ESIGNATURES_MCP_CONFIG,
  [HostedIntegrationType.Fewsats]: FEWSATS_MCP_CONFIG,
  [HostedIntegrationType.Firecrawl]: FIRECRAWL_MCP_CONFIG,
  [HostedIntegrationType.Graphlit]: GRAPHLIT_MCP_CONFIG,
  [HostedIntegrationType.Heroku]: HEROKU_MCP_CONFIG,
  [HostedIntegrationType.IntegrationAppHubspot]:
    INTEGRATION_APP_HUBSPOT_MCP_CONFIG,
  [HostedIntegrationType.LaraTranslate]: LARA_TRANSLATE_MCP_CONFIG,
  [HostedIntegrationType.Logfire]: LOGFIRE_MCP_CONFIG,
  [HostedIntegrationType.Langfuse]: LANGFUSE_MCP_CONFIG,
  [HostedIntegrationType.LingoSupabase]: SUPABASE_LINGO_MCP_CONFIG,
  [HostedIntegrationType.Make]: MAKE_MCP_CONFIG,
  [HostedIntegrationType.Meilisearch]: MEILISEARCH_MCP_CONFIG,
  [HostedIntegrationType.Momento]: MOMENTO_MCP_CONFIG,
  [HostedIntegrationType.Neo4jAura]: NEO4J_AURA_MCP_CONFIG,
  [HostedIntegrationType.Octagon]: OCTAGON_MCP_CONFIG,
  [HostedIntegrationType.Paddle]: PADDLE_MCP_CONFIG,
  [HostedIntegrationType.PayPal]: PAYPAL_MCP_CONFIG,
  [HostedIntegrationType.Qdrant]: QDRANT_MCP_CONFIG,
  [HostedIntegrationType.Raygun]: RAYGUN_MCP_CONFIG,
  [HostedIntegrationType.Rember]: REMBER_MCP_CONFIG,
  [HostedIntegrationType.Riza]: RIZA_MCP_CONFIG,
  [HostedIntegrationType.Search1API]: SEARCH1API_MCP_CONFIG,
  [HostedIntegrationType.Semgrep]: SEMGREP_MCP_CONFIG,
  [HostedIntegrationType.Tavily]: TAVILY_MCP_CONFIG,
  [HostedIntegrationType.Unstructured]: UNSTRUCTURED_MCP_CONFIG,
  [HostedIntegrationType.Vectorize]: VECTORIZE_MCP_CONFIG,
  [HostedIntegrationType.Xero]: XERO_MCP_CONFIG,
  [HostedIntegrationType.Readwise]: READWISE_MCP_CONFIG,
  [HostedIntegrationType.Airbnb]: AIRBNB_MCP_CONFIG,
  [HostedIntegrationType.Mintlify]: MINTLIFY_MCP_CONFIG,
}
