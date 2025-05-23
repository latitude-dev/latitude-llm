import fs from 'fs'
import path from 'path'

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8'),
)

const scripts = pkg.scripts || {}

const tsScripts = Object.keys(scripts).filter((s) => s.startsWith('ts:'))
const pyScripts = Object.keys(scripts).filter((s) => s.startsWith('py:'))

if (tsScripts.length) {
  console.log('Typescript Examples:')
  tsScripts.forEach((s) => console.log('  ' + `npm run ${s}`))
  console.log('')
}
if (pyScripts.length) {
  console.log('Python Examples:')
  pyScripts.forEach((s) => console.log('  ' + `npm run ${s}`))
  console.log('')
}
