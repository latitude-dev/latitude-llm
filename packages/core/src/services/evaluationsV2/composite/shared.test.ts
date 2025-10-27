import { beforeEach, describe, expect, it } from 'vitest'
import { CompositeEvaluationResultMetadata } from '../../../constants'
import { BadRequestError, UnprocessableEntityError } from '../../../lib/errors'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import {
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
      },
      eval2: {
        uuid: generateUUIDIdentifier(),
        name: 'eval2',
        score: 20,
        reason: 'reason2',
        passed: false,
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
