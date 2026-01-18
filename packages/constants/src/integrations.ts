export enum IntegrationType {
  Latitude = 'latitude',
  ExternalMCP = 'custom_mcp',
  Pipedream = 'pipedream',
  HostedMCP = 'mcp_server', // DEPRECATED: Do not use
}

export type ActiveIntegrationType = Exclude<
  IntegrationType,
  IntegrationType.HostedMCP
>

export enum HostedIntegrationType {
  Stripe = 'stripe',
  Slack = 'slack',
  Github = 'github',
  Notion = 'notion',
  Twitter = 'twitter',
  Airtable = 'airtable',
  Linear = 'linear',
  YoutubeCaptions = 'youtube_captions',
  Reddit = 'reddit',
  Telegram = 'telegram',
  Tinybird = 'tinybird',
  Perplexity = 'perplexity',

  AwsKbRetrieval = 'aws_kb_retrieval',
  BraveSearch = 'brave_search',
  EverArt = 'ever_art',
  Fetch = 'fetch',
  GitLab = 'gitlab',
  GoogleMaps = 'google_maps',
  Sentry = 'sentry',
  Puppeteer = 'puppeteer',
  Time = 'time',
  browserbase = 'browserbase',
  Neon = 'neon',
  Postgres = 'postgres',
  Supabase = 'supabase',
  Redis = 'redis',
  Jira = 'jira',
  Attio = 'attio',
  Ghost = 'ghost',
  Figma = 'figma',
  Hyperbrowser = 'hyperbrowser',
  Audiense = 'audiense',
  Apify = 'apify',
  Exa = 'exa',
  YepCode = 'yepcode',
  Monday = 'monday',

  AgentQL = 'agentql',
  AgentRPC = 'agentrpc',
  AstraDB = 'astra_db',
  Bankless = 'bankless',
  Bicscan = 'bicscan',
  Chargebee = 'chargebee',
  Chronulus = 'chronulus',
  CircleCI = 'circleci',
  Codacy = 'codacy',
  CodeLogic = 'codelogic',
  Convex = 'convex',
  Dart = 'dart',
  DevHubCMS = 'devhub_cms',
  Elasticsearch = 'elasticsearch',
  ESignatures = 'esignatures',
  Fewsats = 'fewsats',
  Firecrawl = 'firecrawl',

  Graphlit = 'graphlit',
  Heroku = 'heroku',
  IntegrationAppHubspot = 'integration_app_hubspot',

  LaraTranslate = 'lara_translate',
  Logfire = 'logfire',
  Langfuse = 'langfuse',
  LingoSupabase = 'lingo_supabase',
  Make = 'make',
  Meilisearch = 'meilisearch',
  Momento = 'momento',

  Neo4jAura = 'neo4j_aura',
  Octagon = 'octagon',

  Paddle = 'paddle',
  PayPal = 'paypal',
  Qdrant = 'qdrant',
  Raygun = 'raygun',
  Rember = 'rember',
  Riza = 'riza',
  Search1API = 'search1api',
  Semgrep = 'semgrep',

  Tavily = 'tavily',
  Unstructured = 'unstructured',
  Vectorize = 'vectorize',
  Xero = 'xero',
  Readwise = 'readwise',
  Airbnb = 'airbnb',
  Mintlify = 'mintlify',

  // Require all auth file :point_down:
  // Gmail = 'google_drive',
  // GoogleCalendar = 'google_drive',
  // GoogleDrive = 'google_drive',
  // GoogleWorkspace = 'google_workspace', // env vars not supported (?)

  // TODO: implement these
  // Wordpress = 'wordpress', // Not on OpenTools
  // Discord = 'discord', // Not on OpenTools
  // Intercom = 'intercom', // Not on OpenTools

  // Hubspot = 'hubspot', // Docker based
  // Loops = 'loops', // Does not exist
}

interface IIntegrationReference {
  integrationName: string
  projectId: number
  commitId: number
  documentUuid: string
}

interface TriggerReference extends IIntegrationReference {
  type: 'trigger'
  triggerUuid: string
}

interface ToolReference extends IIntegrationReference {
  type: 'tool'
}

export type IntegrationReference = TriggerReference | ToolReference
