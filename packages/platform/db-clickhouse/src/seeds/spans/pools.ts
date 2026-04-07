export type ModelConfig = {
  readonly provider: string
  readonly model: string
  readonly responseModel: string
  readonly scopeName: string
  readonly costInPerMToken: number
  readonly costOutPerMToken: number
  readonly latencyRange: readonly [min: number, max: number]
  readonly isReasoning?: boolean
  readonly finishReasonStop: string
}

export const MODELS: readonly ModelConfig[] = [
  {
    provider: "openai",
    model: "gpt-4o",
    responseModel: "gpt-4o-2024-08-06",
    scopeName: "openai-instrumentation",
    costInPerMToken: 250,
    costOutPerMToken: 1000,
    latencyRange: [600, 2500],
    finishReasonStop: "stop",
  },
  {
    provider: "openai",
    model: "gpt-4o-mini",
    responseModel: "gpt-4o-mini-2024-07-18",
    scopeName: "openai-instrumentation",
    costInPerMToken: 15,
    costOutPerMToken: 60,
    latencyRange: [200, 900],
    finishReasonStop: "stop",
  },
  {
    provider: "openai",
    model: "o3-mini",
    responseModel: "o3-mini-2025-01-31",
    scopeName: "openai-instrumentation",
    costInPerMToken: 110,
    costOutPerMToken: 440,
    latencyRange: [1500, 6000],
    isReasoning: true,
    finishReasonStop: "stop",
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    responseModel: "claude-sonnet-4-6-20250514",
    scopeName: "anthropic-instrumentation",
    costInPerMToken: 300,
    costOutPerMToken: 1500,
    latencyRange: [800, 3500],
    finishReasonStop: "end_turn",
  },
  {
    provider: "anthropic",
    model: "claude-3-5-haiku",
    responseModel: "claude-3-5-haiku-20241022",
    scopeName: "anthropic-instrumentation",
    costInPerMToken: 80,
    costOutPerMToken: 400,
    latencyRange: [300, 1200],
    finishReasonStop: "end_turn",
  },
  {
    provider: "deepseek",
    model: "deepseek-chat",
    responseModel: "deepseek-chat",
    scopeName: "deepseek-instrumentation",
    costInPerMToken: 14,
    costOutPerMToken: 28,
    latencyRange: [400, 1800],
    finishReasonStop: "stop",
  },
  {
    provider: "google",
    model: "gemini-2.0-flash",
    responseModel: "gemini-2.0-flash",
    scopeName: "google-genai-instrumentation",
    costInPerMToken: 10,
    costOutPerMToken: 40,
    latencyRange: [200, 800],
    finishReasonStop: "stop",
  },
]

export const EMBEDDING_MODELS: readonly ModelConfig[] = [
  {
    provider: "openai",
    model: "text-embedding-3-small",
    responseModel: "text-embedding-3-small",
    scopeName: "openai-instrumentation",
    costInPerMToken: 2,
    costOutPerMToken: 0,
    latencyRange: [40, 200],
    finishReasonStop: "stop",
  },
  {
    provider: "openai",
    model: "text-embedding-3-large",
    responseModel: "text-embedding-3-large",
    scopeName: "openai-instrumentation",
    costInPerMToken: 13,
    costOutPerMToken: 0,
    latencyRange: [50, 300],
    finishReasonStop: "stop",
  },
]

export type ToolConfig = {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly latencyRange: readonly [min: number, max: number]
  readonly sampleArgs: Record<string, unknown>
  readonly sampleResult: unknown
}

export const TOOLS: readonly ToolConfig[] = [
  {
    name: "get_weather",
    description: "Get current weather for a location",
    parameters: {
      type: "object",
      properties: { location: { type: "string", description: "City and state" } },
      required: ["location"],
    },
    latencyRange: [80, 400],
    sampleArgs: { location: "San Francisco, CA" },
    sampleResult: { temperature: 62, conditions: "partly cloudy", humidity: 68 },
  },
  {
    name: "search_web",
    description: "Search the web for information",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    latencyRange: [200, 1500],
    sampleArgs: { query: "latest developments in quantum computing" },
    sampleResult: { results: ["Result 1: Quantum supremacy achieved...", "Result 2: New error correction..."] },
  },
  {
    name: "query_database",
    description: "Execute a SQL query against the analytics database",
    parameters: {
      type: "object",
      properties: { sql: { type: "string" }, database: { type: "string" } },
      required: ["sql"],
    },
    latencyRange: [50, 800],
    sampleArgs: { sql: "SELECT count(*) FROM orders WHERE created_at > '2026-01-01'", database: "analytics" },
    sampleResult: { rows: [{ count: 15432 }] },
  },
  {
    name: "read_file",
    description: "Read the contents of a file",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    latencyRange: [10, 100],
    sampleArgs: { path: "src/utils/helpers.ts" },
    sampleResult: { content: "export function formatDate(d: Date) { ... }", lines: 42 },
  },
  {
    name: "send_email",
    description: "Send an email to a recipient",
    parameters: {
      type: "object",
      properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
      required: ["to", "subject", "body"],
    },
    latencyRange: [100, 600],
    sampleArgs: { to: "user@example.com", subject: "Weekly Report", body: "Here is your weekly summary..." },
    sampleResult: { messageId: "msg-20260301-abc", status: "sent" },
  },
  {
    name: "calculate",
    description: "Evaluate a mathematical expression",
    parameters: {
      type: "object",
      properties: { expression: { type: "string" } },
      required: ["expression"],
    },
    latencyRange: [5, 30],
    sampleArgs: { expression: "((45 * 12) + 380) / 7" },
    sampleResult: { result: 131.43 },
  },
  {
    name: "create_ticket",
    description: "Create a support ticket in the issue tracker",
    parameters: {
      type: "object",
      properties: { title: { type: "string" }, priority: { type: "string" }, description: { type: "string" } },
      required: ["title", "priority"],
    },
    latencyRange: [100, 500],
    sampleArgs: { title: "Login page not loading", priority: "high", description: "Users report 500 errors..." },
    sampleResult: { ticketId: "TICKET-4521", url: "https://tracker.example.com/TICKET-4521" },
  },
  {
    name: "translate",
    description: "Translate text between languages",
    parameters: {
      type: "object",
      properties: { text: { type: "string" }, from: { type: "string" }, to: { type: "string" } },
      required: ["text", "to"],
    },
    latencyRange: [50, 300],
    sampleArgs: { text: "Hello, how are you?", from: "en", to: "es" },
    sampleResult: { translated: "Hola, ¿cómo estás?" },
  },
  {
    name: "extract_entities",
    description: "Extract named entities from text",
    parameters: {
      type: "object",
      properties: { text: { type: "string" }, types: { type: "array", items: { type: "string" } } },
      required: ["text"],
    },
    latencyRange: [30, 200],
    sampleArgs: { text: "Apple CEO Tim Cook announced...", types: ["organization", "person"] },
    sampleResult: {
      entities: [
        { text: "Apple", type: "organization" },
        { text: "Tim Cook", type: "person" },
      ],
    },
  },
  {
    name: "run_tests",
    description: "Run the test suite for a given module",
    parameters: {
      type: "object",
      properties: { module: { type: "string" }, pattern: { type: "string" } },
      required: ["module"],
    },
    latencyRange: [500, 3000],
    sampleArgs: { module: "auth", pattern: "*.test.ts" },
    sampleResult: { passed: 23, failed: 1, skipped: 2, duration: 1840 },
  },
]

export const SYSTEM_PROMPTS: readonly string[] = [
  "You are a helpful assistant that answers questions concisely and accurately.",
  "You are a senior software engineer. Help the user with code reviews and debugging.",
  "You are a customer support agent for an e-commerce platform. Be friendly and solution-oriented.",
  "You are a data analyst. Help interpret data, suggest queries, and explain trends.",
  "You are a creative writing assistant. Help brainstorm ideas and refine prose.",
  "You are a research assistant specializing in academic literature. Cite sources when possible.",
  "You are a DevOps engineer. Help with infrastructure, CI/CD, and deployment questions.",
  "You are a language tutor. Help users practice and learn new languages conversationally.",
]

export const USER_PROMPTS: readonly string[] = [
  "Summarize this document for me.",
  "What's the weather like in San Francisco today?",
  "Find and fix the bug in the authentication module.",
  "Write a quarterly report based on our sales data.",
  "Can you translate this email to Spanish?",
  "How do I optimize this SQL query? It's taking too long.",
  "Create a ticket for the login page issue our users reported.",
  "Explain the difference between TCP and UDP.",
  "Review this pull request and suggest improvements.",
  "What are the latest developments in AI?",
  "Help me write unit tests for the payment service.",
  "Generate a summary of customer feedback from last month.",
  "What's the best way to implement rate limiting?",
  "Analyze our error logs and identify recurring patterns.",
  "Draft an email to the team about the upcoming release.",
  "How do I set up a CI/CD pipeline with GitHub Actions?",
  "Explain the pros and cons of microservices vs monolith.",
  "What does this error mean? TypeError: Cannot read properties of undefined",
  "Calculate the total revenue for Q1 2026.",
  "Search for recent papers on transformer architectures.",
  "Help me refactor this function to be more readable.",
  "What are the security implications of this API design?",
  "Generate a migration script for adding the new users table.",
  "How should I handle pagination in a GraphQL API?",
  "Compare the performance of PostgreSQL vs ClickHouse for analytics.",
  "Write a cron expression for running a job every weekday at 9am.",
  "Explain how OAuth 2.0 authorization code flow works.",
  "Debug why our memory usage keeps increasing in production.",
  "What's the best caching strategy for our product catalog?",
  "Help me write documentation for this REST endpoint.",
]

export const ASSISTANT_RESPONSES: readonly string[] = [
  "Based on my analysis, here's a summary of the key findings from the document...",
  "The current weather in San Francisco is 62°F with partly cloudy skies and moderate humidity.",
  "I found the bug in the authentication module. The issue is in the token validation logic where expired tokens are not being properly rejected.",
  "Here's the quarterly report: Total revenue was $2.4M, representing a 15% increase over Q4 2025...",
  "Here's the Spanish translation of your email...",
  "The query can be optimized by adding an index on the created_at column and rewriting the subquery as a JOIN.",
  "I've created ticket TICKET-4521 for the login page issue with high priority.",
  "TCP provides reliable, ordered delivery with connection management, while UDP is connectionless and faster but doesn't guarantee delivery.",
  "I've reviewed the pull request. Here are my suggestions: 1) Extract the validation logic into a separate function...",
  "Recent AI developments include advances in multimodal models, improved reasoning capabilities, and new approaches to AI safety.",
  "Here are the unit tests for the payment service covering the main scenarios: successful payment, insufficient funds, and network errors.",
  "Customer feedback analysis shows 78% positive sentiment, with the most common requests being faster load times and dark mode support.",
  "For rate limiting, I recommend using a token bucket algorithm with Redis as the backend store. Here's an implementation...",
  "The error logs show three recurring patterns: 1) Database connection timeouts during peak hours, 2) Memory spikes from the image processing pipeline...",
  "Here's the draft email for the team about the upcoming v2.5 release scheduled for next Friday...",
  "To set up GitHub Actions CI/CD, create a workflow file in .github/workflows/ with build, test, and deploy stages...",
  "Microservices offer better scalability and team independence but add complexity in deployment and debugging. For your team size, I'd recommend starting with a modular monolith.",
  "This TypeError occurs because you're trying to access a property on an undefined object. Check that the user object is properly initialized before accessing user.profile.name.",
  "Based on the sales data, total Q1 2026 revenue is $3,847,210 across all product lines.",
  "I found several recent papers on transformer architectures. The most relevant ones cover sparse attention mechanisms and efficient inference...",
]

export const USER_IDS: readonly string[] = [
  "user_2nJk8mPqR1",
  "user_7xLwB3vKe9",
  "user_4hTfN6yZs5",
  "user_9aCdQ2wMr3",
  "user_1pXjE8bGn7",
  "user_6sYkH4tLv2",
  "user_3mWcF9zDa8",
  "user_8rUeI5xOk4",
  "user_5gVbJ1qSn6",
  "user_0dNiL7hCm0",
  "usr_alice@acme.com",
  "usr_bob@acme.com",
  "usr_carol@globex.io",
  "usr_dave@initech.net",
  "usr_eve@piedpiper.com",
]

export const SERVICE_NAMES: readonly string[] = [
  "chat-service",
  "api-gateway",
  "agent-orchestrator",
  "rag-pipeline",
  "customer-support-bot",
  "code-assistant",
  "data-analyst",
  "email-service",
  "search-service",
  "content-generator",
]

export const ERROR_TYPES: readonly { type: string; message: string }[] = [
  { type: "RateLimitError", message: "Rate limit exceeded. Please retry after 30 seconds." },
  { type: "TimeoutError", message: "Request timed out after 30000ms." },
  { type: "InvalidRequestError", message: "The model does not support the provided parameters." },
  { type: "AuthenticationError", message: "Invalid API key provided." },
  { type: "ServiceUnavailableError", message: "The model is currently overloaded. Please try again later." },
  { type: "ContentFilterError", message: "Content was filtered due to policy violations." },
  {
    type: "ContextLengthExceededError",
    message: "Maximum context length exceeded. Reduce input or use a larger model.",
  },
]

export const SESSION_FOLLOWUPS: readonly string[] = [
  "Can you elaborate on that?",
  "That's helpful, but can you go into more detail?",
  "What about the edge cases?",
  "How would this work in production?",
  "Can you give me a concrete example?",
  "What are the trade-offs of that approach?",
  "How does this compare to the alternative?",
  "Can you summarize that in a few bullet points?",
  "What would you recommend as next steps?",
  "Are there any potential issues I should watch out for?",
  "Can you refactor that to be cleaner?",
  "What about performance implications?",
  "How should I test this?",
  "Can you explain why you chose that approach?",
  "What if the input is invalid or missing?",
  "How would I integrate this with the existing code?",
  "Can you also add error handling?",
  "What about security considerations?",
  "OK, let's move on to the next part.",
  "Thanks. Now, can you help me with a related problem?",
  "Interesting. What else should I know about this?",
  "Got it. How does this affect the other components?",
  "Makes sense. Can you write the full implementation?",
  "Perfect. Now let's handle the error case.",
  "What about monitoring and observability for this?",
  "How would this behave under heavy load?",
  "Can you walk me through the data flow step by step?",
  "What dependencies does this introduce?",
  "Is there a simpler way to achieve the same result?",
  "How do we handle backwards compatibility here?",
]
