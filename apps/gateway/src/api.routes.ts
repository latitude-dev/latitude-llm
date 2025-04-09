const BASE_PATH = '/api'
const V1_PATH = `${BASE_PATH}/v1`
const V2_PATH = `${BASE_PATH}/v2`
const V3_PATH = `${BASE_PATH}/v3`

const PROJECTS = 'projects'
const CONVERSATIONS = 'conversations'
const PROJECT_DETAIL = `${PROJECTS}/{projectId}`
const VERSIONS = `${PROJECT_DETAIL}/versions`
const VERSION_DETAIL = `${VERSIONS}/{versionUuid}`
const DOCUMENTS = `${VERSION_DETAIL}/documents`

const V1_DOCUMENTS = `${V1_PATH}/${DOCUMENTS}`
const V2_DOCUMENTS = `${V2_PATH}/${DOCUMENTS}`
const V3_DOCUMENTS = `${V3_PATH}/${DOCUMENTS}`

const V1_CONVERSATIONS = `${V1_PATH}/${CONVERSATIONS}`
const V2_CONVERSATIONS = `${V2_PATH}/${CONVERSATIONS}`
const V3_CONVERSATIONS = `${V3_PATH}/${CONVERSATIONS}`

const V2_CONVERSATION_DETAIL = `${V2_CONVERSATIONS}/{conversationUuid}`
const V3_CONVERSATION_DETAIL = `${V3_CONVERSATIONS}/{conversationUuid}`

const V2_EVALUATIONS = `${V2_CONVERSATIONS}/{conversationUuid}/evaluations`
const V3_EVALUATIONS = `${V3_CONVERSATIONS}/{conversationUuid}/evaluations`

const V2_EVALUATION_DETAIL = `${V2_EVALUATIONS}/{evaluationUuid}`
const V3_EVALUATION_DETAIL = `${V3_EVALUATIONS}/{evaluationUuid}`

export const API_ROUTES = {
  v1: {
    documents: {
      get: `${V1_DOCUMENTS}/:documentPath{.+}`,
      run: `${V1_DOCUMENTS}/run`,
      logs: `${V1_DOCUMENTS}/logs`,
    },
    conversations: {
      chat: `${V1_CONVERSATIONS}/{conversationUuid}/chat`,
    },
  },
  v2: {
    documents: {
      get: `${V2_DOCUMENTS}/:documentPath{.+}`,
      getOrCreate: `${V2_DOCUMENTS}/get-or-create`,
      run: `${V2_DOCUMENTS}/run`,
      logs: `${V2_DOCUMENTS}/logs`,
    },
    conversations: {
      chat: `${V2_CONVERSATION_DETAIL}/chat`,
      evaluate: `${V2_CONVERSATION_DETAIL}/evaluate`,
      createEvaluationResult: `${V2_EVALUATION_DETAIL}/evaluation-results`,
    },
  },
  v3: {
    documents: {
      getAll: V3_DOCUMENTS,
      get: `${V3_DOCUMENTS}/:documentPath{.+}`,
      getOrCreate: `${V3_DOCUMENTS}/get-or-create`,
      run: `${V3_DOCUMENTS}/run`,
      logs: `${V3_DOCUMENTS}/logs`,
    },
    conversations: {
      chat: `${V3_CONVERSATION_DETAIL}/chat`,
      evaluate: `${V3_CONVERSATION_DETAIL}/evaluate`,
      createEvaluationResult: `${V3_EVALUATION_DETAIL}/evaluation-results`,
    },
  },
}
