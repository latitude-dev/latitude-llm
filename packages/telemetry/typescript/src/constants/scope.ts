export const SCOPE_LATITUDE = "so.latitude.instrumentation"

export enum InstrumentationScope {
  Manual = "manual",
  Latitude = "latitude",
  OpenAI = "openai",
  Anthropic = "anthropic",
  AzureOpenAI = "azure",
  VercelAI = "vercelai",
  VertexAI = "vertexai",
  AIPlatform = "aiplatform",
  MistralAI = "mistralai",
  Bedrock = "bedrock",
  Sagemaker = "sagemaker",
  TogetherAI = "togetherai",
  Replicate = "replicate",
  Groq = "groq",
  Cohere = "cohere",
  LiteLLM = "litellm",
  Langchain = "langchain",
  LlamaIndex = "llamaindex",
  DSPy = "dspy",
  Haystack = "haystack",
  Ollama = "ollama",
  Transformers = "transformers",
  AlephAlpha = "alephalpha",
}

export enum LogSources {
  API = "api",
  AgentAsTool = "agent_as_tool",
  Copilot = "copilot",
  EmailTrigger = "email_trigger",
  Evaluation = "evaluation",
  Experiment = "experiment",
  IntegrationTrigger = "integration_trigger",
  Playground = "playground",
  ScheduledTrigger = "scheduled_trigger",
  SharedPrompt = "shared_prompt",
  ShadowTest = "shadow_test",
  ABTestChallenger = "ab_test_challenger",
  User = "user",
  Optimization = "optimization",
}

export const HEAD_COMMIT = "live"
export const DOCUMENT_PATH_REGEXP = /^([\w-]+\/)*([\w-.])+$/
