// analyze-types.js
import fs from 'fs'
import readline from 'readline'

const file = './tsc-tracing/types.json'

async function analyze() {
  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  })

  const counts = []

  for await (const line of rl) {
    if (line.includes('"count"')) {
      try {
        const obj = JSON.parse(line.endsWith(',') ? line.slice(0, -1) : line)
        counts.push({
          symbol: obj.symbolName || obj.display || '<anonymous>',
          count: obj.count,
          path: obj.firstDeclaration?.path,
        })
      } catch {}
    }
  }

  counts.sort((a, b) => b.count - a.count)

  console.log('Top 20 most instantiated types:')
  for (const c of counts.slice(0, 20)) {
    console.log(
      `${c.count.toLocaleString()}  -  ${c.symbol} ${c.path ? '(' + c.path + ')' : ''}`,
    )
  }
}

analyze()
