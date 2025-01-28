export type SupportedLanguage = 'python' | 'javascript'
export type CodeToolArgs = {
  code: string
  language: SupportedLanguage
  dependencies?: string[]
}
export type CodeRunResult = {
  output: string
  exitCode?: number
}
