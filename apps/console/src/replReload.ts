import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const LOADED_MODULES: Record<string, string> = {}

async function loadModule(specifier: string) {
  const resolvedPath = require.resolve(specifier)
  const url = `${pathToFileURL(resolvedPath).href}?t=${Date.now()}`
  const module = await import(url)
  LOADED_MODULES[specifier] = resolvedPath
  return module
}

// NOTE: Not working fix it later
// The idea is to be able to reload all
// modules loaded during the console session
async function reloadAllModules() {
  const entries = Object.entries(LOADED_MODULES)
  const reloaded: Record<string, any> = {}
  for (const [specifier, resolvedPath] of entries) {
    const url = `${pathToFileURL(resolvedPath).href}?t=${Date.now()}`
    const mod = await import(url)
    reloaded[specifier] = mod
  }
  console.log(`🔄 Reloaded ${entries.length} modules.`)

  return reloaded
}

export { loadModule, reloadAllModules }
