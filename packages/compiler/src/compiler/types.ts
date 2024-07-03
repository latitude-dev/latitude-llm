export type SupportedMethodRequirements = {
  // Whether the results of the method can be interpolated to the query or not. Default is 'allow'
  interpolationPolicy?: 'allow' | 'disallow' | 'require'

  // How the method should be interpolated into the query. Default is 'parameterize'
  interpolationMethod?: 'parameterize' | 'raw'

  // If the method requires static arguments or allows using logic expressions. Default is false
  requireStaticArguments?: boolean
}
export type SupportedMethod = {
  requirements?: Partial<SupportedMethodRequirements>
  resolve: Function
  readMetadata: (args?: unknown[]) => Promise<QueryMetadata> // Note: `readMetadata` will only receive the function's actual arguments when `requireStaticArguments` is true
}

export type ResolveFn = (value: unknown) => Promise<string>

export type CompileContext = {
  sql: string // Full original query
  supportedMethods: Record<string, SupportedMethod> // Supported methods by the connector
  resolveFn: ResolveFn // Resolves a value to a string that can be injected in the query
}
type Config = Record<string, unknown>
export type QueryMetadata<T extends Config = Config> = {
  config: T // Config tags defined in the query
  methods: Set<string> // Supported methods used in the query
  rawSql?: string // Unprocessed SQL query
  sqlHash?: string // Hash of the SQL query
}
