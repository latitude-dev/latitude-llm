const BASE_PATH = '/api'
const V2_PATH = `${BASE_PATH}/v2`
const PROJECTS = `${V2_PATH}/projects`
const PROJECT_DETAIL = `${PROJECTS}/{projectId}`
const VERSIONS = `${PROJECT_DETAIL}/versions`
const VERSION_DETAIL = `${VERSIONS}/{versionUuid}`
const DOCUMENTS = `${VERSION_DETAIL}/documents`

export const ROUTES = {
  v2: {
    documents: {
      run: `${DOCUMENTS}/run`,
    },
  },
}
