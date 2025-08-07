import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { REPLServer } from 'node:repl'

export function setupReplHistory(repl: REPLServer) {
  // History file path, e.g., ~/.latitude_repl_history
  const historyPath = path.join(os.homedir(), '.latitude_repl_history')

  // Ensure the file exists
  fs.openSync(historyPath, 'a') // create if it doesn't exist

  repl.setupHistory(historyPath, (err) => {
    if (err) console.error('Error setting up REPL history:', err)
  })
}
