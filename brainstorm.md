// agent.ts

import { runAgent } from '@latitude-data/agent-sdk'

runAgent('prompts/weather-agent', {
parameters: {
location: 'San Francisco, CA',
},
tools: {
getWeather: (location) => {
console.log(location)

      // TODO: Implement it
    }

},
model: 'openai/gpt-5.2',
})

const accuracy = Eval('Accuracy', {
...
})

runExperiment('prompts/weather-agent', {
dataset: initDataset('patata'),
variations: {
'openai': {
model: 'openai/gpt-5.2'
},
'anthropic': {
model: 'anthropic/opus-4.5'
}
},
evals: [accuracy]
})
