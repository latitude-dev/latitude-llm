const BASE_PATH = '/api'
const V1_PATH = `${BASE_PATH}/v1`
const V2_PATH = `${BASE_PATH}/v2`

const PROJECTS = 'projects'
const CONVERSATIONS = 'conversations'
const PROJECT_DETAIL = `${PROJECTS}/{projectId}`
const VERSIONS = `${PROJECT_DETAIL}/versions`
const VERSION_DETAIL = `${VERSIONS}/{versionUuid}`
const DOCUMENTS = `${VERSION_DETAIL}/documents`

const V1_DOCUMENTS = `${V1_PATH}/${DOCUMENTS}`
const V2_DOCUMENTS = `${V2_PATH}/${DOCUMENTS}`

const V1_CONVERSATIONS = `${V1_PATH}/${CONVERSATIONS}`
const V2_CONVERSATIONS = `${V2_PATH}/${CONVERSATIONS}`

export const ROUTES = {
  v1: {
    documents: {
      get: `${V1_DOCUMENTS}/:documentPath{.+}`,
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
      chat: `${V2_CONVERSATIONS}/{conversationUuid}/chat`,
      evaluate: `${V2_CONVERSATIONS}/{conversationUuid}/evaluate`,
      evaluations: `${V2_CONVERSATIONS}/{conversationUuid}/evaluations`,
    },
  },
}
