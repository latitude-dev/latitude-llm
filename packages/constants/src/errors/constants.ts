export enum LatitudeErrorCodes {
  UnexpectedError = 'UnexpectedError',
  OverloadedError = 'OverloadedError',
  RateLimitError = 'RateLimitError',
  UnauthorizedError = 'UnauthorizedError',
  ForbiddenError = 'ForbiddenError',
  BadRequestError = 'BadRequestError',
  NotFoundError = 'NotFoundError',
  ConflictError = 'ConflictError',
  UnprocessableEntityError = 'UnprocessableEntityError',
  NotImplementedError = 'NotImplementedError',
  PaymentRequiredError = 'PaymentRequiredError',
  AbortedError = 'AbortedError',
  BillingError = 'BillingError',
}

export type LatitudeErrorDetails = {
  [key: string | number | symbol]: string[] | string | undefined
}

// NOTE: If you add a new error code, please add it to the pg enum in models/runErrors.ts
export enum RunErrorCodes {
  AIProviderConfigError = 'ai_provider_config_error',
  AIRunError = 'ai_run_error',
  ChainCompileError = 'chain_compile_error',
  DefaultProviderExceededQuota = 'default_provider_exceeded_quota_error',
  DefaultProviderInvalidModel = 'default_provider_invalid_model_error',
  DocumentConfigError = 'document_config_error',
  ErrorGeneratingMockToolResult = 'error_generating_mock_tool_result',
  FailedToWakeUpIntegrationError = 'failed_to_wake_up_integration_error',
  InvalidResponseFormatError = 'invalid_response_format_error',
  MaxStepCountExceededError = 'max_step_count_exceeded_error',
  MissingProvider = 'missing_provider_error',
  RateLimit = 'rate_limit_error',
  Unknown = 'unknown_error',
  UnsupportedProviderResponseTypeError = 'unsupported_provider_response_type_error',
  PaymentRequiredError = 'payment_required_error',
  AbortError = 'abort_error',

  // DEPRECATED, but do not delete
  EvaluationRunMissingProviderLogError = 'ev_run_missing_provider_log_error',
  EvaluationRunMissingWorkspaceError = 'ev_run_missing_workspace_error',
  EvaluationRunResponseJsonFormatError = 'ev_run_response_json_format_error',
  EvaluationRunUnsupportedResultTypeError = 'ev_run_unsupported_result_type_error',
}
// NOTE: If you add a new error code, please add it to the pg enum in models/runErrors.ts

export type RunErrorDetails<C extends RunErrorCodes> =
  C extends RunErrorCodes.ChainCompileError
    ? { compileCode: string; message: string }
    : C extends RunErrorCodes.Unknown
      ? { stack: string }
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
