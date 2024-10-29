export enum LatitudeErrorCodes {
  UnexpectedError = 'UnexpectedError',
  RateLimitError = 'RateLimitError',
  UnauthorizedError = 'UnauthorizedError',
  ForbiddenError = 'ForbiddenError',
  BadRequestError = 'BadRequestError',
  NotFoundError = 'NotFoundError',
  ConflictError = 'ConflictError',
  UnprocessableEntityError = 'UnprocessableEntityError',
}

// NOTE: If you add a new error code, please add it to the pg enum in models/runErrors.ts
export enum RunErrorCodes {
  Unknown = 'unknown_error',
  DefaultProviderExceededQuota = 'default_provider_exceeded_quota_error',
  DefaultProviderInvalidModel = 'default_provider_invalid_model_error',
  DocumentConfigError = 'document_config_error',
  MissingProvider = 'missing_provider_error',
  ChainCompileError = 'chain_compile_error',
  AIRunError = 'ai_run_error',
  UnsupportedProviderResponseTypeError = 'unsupported_provider_response_type_error',
  AIProviderConfigError = 'ai_provider_config_error',
  EvaluationRunMissingProviderLogError = 'ev_run_missing_provider_log_error',
  EvaluationRunMissingWorkspaceError = 'ev_run_missing_workspace_error',
  EvaluationRunUnsupportedResultTypeError = 'ev_run_unsupported_result_type_error',
  EvaluationRunResponseJsonFormatError = 'ev_run_response_json_format_error',
}
// NOTE: If you add a new error code, please add it to the pg enum in models/runErrors.ts

export type RunErrorDetails<C extends RunErrorCodes> =
  C extends RunErrorCodes.ChainCompileError
    ? { compileCode: string; message: string }
    : never

export enum ApiErrorCodes {
  HTTPException = 'http_exception',
  InternalServerError = 'internal_server_error',
}

export type DbErrorRef = {
  entityUuid: string
  entityType: string
}

export type ApiErrorJsonResponse = {
  name: string
  message: string
  details: object
  errorCode: ApiResponseCode
  dbErrorRef?: DbErrorRef
}
export type ApiResponseCode = RunErrorCodes | ApiErrorCodes | LatitudeErrorCodes
