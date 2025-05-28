import fs from 'fs'
import path from 'path'

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8'),
)

const scripts = pkg.scripts || {}

const tsCasesExamples = Object.keys(scripts).filter((s) =>
  s.startsWith('ts:cases:'),
)
const pyCasesExamples = Object.keys(scripts).filter((s) =>
  s.startsWith('py:cases:'),
)

if (tsCasesExamples.length) {
  console.log('Typescript Cases examples:')
  tsCasesExamples.forEach((s) => console.log('  ' + `npm run ${s}`))
  console.log('')
}
if (pyCasesExamples.length) {
  console.log('Python Cases examples:')
  pyCasesExamples.forEach((s) => console.log('  ' + `npm run ${s}`))
  console.log('')
}

const tsSdkExamples = Object.keys(scripts).filter((s) =>
  s.startsWith('ts:sdk:'),
)
const pySdkExamples = Object.keys(scripts).filter((s) =>
  s.startsWith('py:sdk:'),
)

if (tsSdkExamples.length) {
  console.log('Typescript SDK examples:')
  tsSdkExamples.forEach((s) => console.log('  ' + `npm run ${s}`))
  console.log('')
}
if (pySdkExamples.length) {
  console.log('Python SDK examples:')
  pySdkExamples.forEach((s) => console.log('  ' + `npm run ${s}`))
  console.log('')
}
