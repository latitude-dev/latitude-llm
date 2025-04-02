import { createModelSpec } from './helpers'

export const PERPLEXITY_MODELS = createModelSpec({
  defaultModel: 'sonar',
  models: {
    'sonar-deep-research': {
      cost: {
        input: 0.002, // $2 per million tokens = $0.002 per thousand
        output: 0.008, // $8 per million tokens = $0.008 per thousand
      },
      contextWindow: 128000,
    },
    'sonar-reasoning-pro': {
      cost: {
        input: 0.002, // $2 per million tokens = $0.002 per thousand
        output: 0.008, // $8 per million tokens = $0.008 per thousand
      },
      contextWindow: 128000,
    },
    'sonar-reasoning': {
      cost: {
        input: 0.001, // $1 per million tokens = $0.001 per thousand
        output: 0.005, // $5 per million tokens = $0.005 per thousand
      },
      contextWindow: 128000,
    },
    'sonar-pro': {
      cost: {
        input: 0.003, // $3 per million tokens = $0.003 per thousand
        output: 0.015, // $15 per million tokens = $0.015 per thousand
      },
      contextWindow: 200000,
    },
    sonar: {
      cost: {
        input: 0.001, // $1 per million tokens = $0.001 per thousand
        output: 0.001, // $1 per million tokens = $0.001 per thousand
      },
      contextWindow: 128000,
    },
    'r1-1776': {
      cost: {
        input: 0.002, // $2 per million tokens = $0.002 per thousand
        output: 0.008, // $8 per million tokens = $0.008 per thousand
      },
      contextWindow: 128000,
    },
    'pplx-7b-online': {
      cost: { input: 0.1, output: 0.2 },
    },
    'pplx-70b-online': {
      cost: { input: 0.1, output: 0.2 },
    },
    'pplx-7b-chat': {
      cost: { input: 0.1, output: 0.2 },
    },
    'pplx-70b-chat': {
      cost: { input: 0.1, output: 0.2 },
    },
    'mistral-7b-instruct': {
      cost: { input: 0.1, output: 0.2 },
    },
    'codellama-34b-instruct': {
      cost: { input: 0.1, output: 0.2 },
    },
    'codellama-70b-instruct': {
      cost: { input: 0.1, output: 0.2 },
    },
    'sonar-small-chat': {
      cost: { input: 0.1, output: 0.2 },
    },
    'sonar-small-online': {
      cost: { input: 0.1, output: 0.2 },
    },
    'sonar-medium-chat': {
      cost: { input: 0.1, output: 0.2 },
    },
    'sonar-medium-online': {
      cost: { input: 0.1, output: 0.2 },
    },
  },
})
