import { getCommitChanges } from '../../../../commits'
import { CopilotTool } from '../types'

const listCommitChanges: CopilotTool = async ({ workspace, commit }) => {
  return await getCommitChanges({ workspace, commit })
}

export default listCommitChanges
