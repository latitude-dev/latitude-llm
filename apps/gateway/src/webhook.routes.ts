const BASE_PATH = '/webhook'

export const WEBHOOK_ROUTES = {
  email: `${BASE_PATH}/email`,
  legacyIntegration: `${BASE_PATH}/integration/:triggerUuid`,
  integration: `${BASE_PATH}/integration/:triggerUuid/:commitUuid`,
}
