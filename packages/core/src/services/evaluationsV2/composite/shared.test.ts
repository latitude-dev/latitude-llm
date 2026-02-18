import { beforeEach, describe, expect, it } from 'vitest'
import {
  CompositeEvaluationResultMetadata,
  EvaluationType,
  LlmEvaluationMetric,
  RuleEvaluationMetric,
} from '../../../constants'
import { BadRequestError, UnprocessableEntityError } from '../../../lib/errors'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import {
  buildResults,
  combineScore,
  FORMULA_COMPLEXITY_LIMIT,
  validateFormula,
} from './shared'

describe('validateFormula', () => {
  let evaluations: string[]

  beforeEach(async () => {
    evaluations = Array(10)
      .fill(0)
      .map(() => generateUUIDIdentifier())
  })

  it('fails when formula is empty', async () => {
    expect(() => validateFormula('', evaluations).unwrap()).toThrowError(
      new BadRequestError('Formula is empty'),
    )
  })

  it('fails when formula is too complex', async () => {
    expect(() =>
      validateFormula(
        Array(FORMULA_COMPLEXITY_LIMIT)
          .fill(`EVAL(${evaluations[0]})`)
          .join('+'),
        evaluations,
      ).unwrap(),
    ).toThrowError(new BadRequestError('Formula is too complex'))
  })

  it('fails when variable is not declared', async () => {
    expect(() => validateFormula('A + B', evaluations).unwrap()).toThrowError(
      new BadRequestError(`Variable 'A' in formula is not EVAL() or RESULTS()`),
    )
  })

  it('fails when formula is invalid', async () => {
    expect(() => validateFormula('1 +', evaluations).unwrap()).toThrowError(
      new BadRequestError('unexpected TEOF: EOF'),
    )
  })

  it('fails when parameter is not a sub-evaluation', async () => {
    const uuid = generateUUIDIdentifier()
    expect(() =>
      validateFormula(`EVAL('${uuid}')`, evaluations).unwrap(),
    ).toThrowError(
      new BadRequestError(
        `Evaluation '${uuid}' in formula is not a sub-evaluation`,
      ),
    )
  })

  it('succeeds when formula does not contain evaluations', async () => {
    expect(validateFormula('1 + 2', evaluations).unwrap()).toBeTruthy()
  })

  it('succeeds when formula contains evaluations', async () => {
    expect(
      validateFormula(
        `((EVAL('${evaluations[0]}') * 2) + (EVAL('${evaluations[1]}')/3) - (EVAL('${evaluations[2]}') * EVAL('${evaluations[3]}')))/RESULTS()`,
        evaluations,
      ).unwrap(),
    ).toBeTruthy()
  })
})

describe('combineScore', () => {
  let results: CompositeEvaluationResultMetadata['results']

  beforeEach(async () => {
    results = {
      eval1: {
        uuid: generateUUIDIdentifier(),
        name: 'eval1',
        score: 10,
        reason: 'reason1',
        passed: true,
        tokens: 100,
      },
      eval2: {
        uuid: generateUUIDIdentifier(),
        name: 'eval2',
        score: 20,
        reason: 'reason2',
        passed: false,
        tokens: 200,
      },
      eval3: {
        uuid: generateUUIDIdentifier(),
        name: 'eval3',
        score: 30,
        reason: 'reason3',
        passed: false,
      },
      eval4: {
        uuid: generateUUIDIdentifier(),
        name: 'eval4',
        score: 40,
        reason: 'reason4',
        passed: true,
        tokens: 400,
      },
    }
  })

  it('fails when parser fails', async () => {
    expect(() => combineScore('1 + ', results)).toThrowError(
      new Error('unexpected TEOF: EOF'),
    )
  })

  it('fails when score is not a number', async () => {
    expect(() => combineScore('1 / 0', results)).toThrowError(
      new UnprocessableEntityError('Combined score is not a number'),
    )
  })

  it('succeeds when score is a number', async () => {
    expect(
      combineScore(
        "((EVAL('eval1') * 0.5) + (EVAL('eval2') / 2) + (EVAL('eval3') + 5) + (EVAL('eval4') - 10)) / RESULTS()",
        results,
      ),
    ).toEqual(20)
  })
})

describe('buildResults', () => {
  function makeLlmResult(evalUuid: string, tokens: number) {
    return {
      result: {
        uuid: generateUUIDIdentifier(),
        normalizedScore: 80,
        hasPassed: true,
        metadata: {
          actualOutput: 'test output',
          evaluationLogId: 1,
          reason: 'good output',
          tokens,
          cost: 0.01,
          duration: 100,
          configuration: {
            reverseScale: false,
            provider: 'openai',
            model: 'gpt-4o',
            criteria: 'test',
            passDescription: 'pass',
            failDescription: 'fail',
          },
        },
        error: null,
      } as any,
      evaluation: {
        uuid: evalUuid,
        name: 'LLM Eval',
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
      } as any,
    }
  }

  function makeRuleResult(evalUuid: string) {
    return {
      result: {
        uuid: generateUUIDIdentifier(),
        normalizedScore: 100,
        hasPassed: true,
        metadata: {
          actualOutput: 'hello',
          expectedOutput: 'hello',
          configuration: {
            reverseScale: false,
            caseInsensitive: false,
          },
        },
        error: null,
      } as any,
      evaluation: {
        uuid: evalUuid,
        name: 'Rule Eval',
        type: EvaluationType.Rule,
        metric: RuleEvaluationMetric.ExactMatch,
      } as any,
    }
  }

  it('extracts tokens from LLM evaluation resultUsage', () => {
    const evalUuid = generateUUIDIdentifier()
    const entry = makeLlmResult(evalUuid, 150)

    const metadatas = buildResults([entry])

    expect(metadatas[evalUuid]!.tokens).toBe(150)
    expect(metadatas[evalUuid]!.reason).toBe('good output')
  })

  it('sets tokens to undefined for rule evaluations without resultUsage', () => {
    const evalUuid = generateUUIDIdentifier()
    const entry = makeRuleResult(evalUuid)

    const metadatas = buildResults([entry])

    expect(metadatas[evalUuid]!.tokens).toBeUndefined()
  })

  it('builds results from mixed sub-evaluations preserving tokens per type', () => {
    const llmUuid = generateUUIDIdentifier()
    const ruleUuid = generateUUIDIdentifier()

    const metadatas = buildResults([
      makeLlmResult(llmUuid, 200),
      makeRuleResult(ruleUuid),
    ])

    expect(metadatas[llmUuid]!.tokens).toBe(200)
    expect(metadatas[ruleUuid]!.tokens).toBeUndefined()
  })

  it('throws when a sub-evaluation has an error', () => {
    expect(() =>
      buildResults([
        {
          result: {
            uuid: generateUUIDIdentifier(),
            error: { message: 'eval failed' },
          } as any,
          evaluation: {
            uuid: generateUUIDIdentifier(),
            name: 'Eval',
            type: EvaluationType.Llm,
            metric: LlmEvaluationMetric.Binary,
          } as any,
        },
      ]),
    ).toThrowError(BadRequestError)
  })
})
