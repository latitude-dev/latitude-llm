import { Parser, ParserOptions } from 'expr-eval'
import {
  CompositeEvaluationCustomResultMetadata,
  CompositeEvaluationResultMetadata,
  EvaluationMetric,
  EvaluationResultSuccessValue,
  EvaluationType,
} from '../../../constants'
import { BadRequestError, UnprocessableEntityError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { ResultWithEvaluationV2 } from '../../../schema/types'
import { getEvaluationMetricSpecification } from '../specifications'

export const FORMULA_COMPLEXITY_LIMIT = 36 * (25 + 1) + 100 // 25 evaluations + 1 results variable + 100 characters for other operators

const FORMULA_EVALUATION_VARIABLE = 'EVAL'
const FORMULA_EVALUATION_VARIABLE_REGEX = /EVAL\(([^)]*)\)/g
const FORMULA_RESULTS_VARIABLE = 'RESULTS'

const FORMULA_PARSER_OPTIONS: ParserOptions = {
  allowMemberAccess: false,
  operators: {
    comparison: false,
    concatenate: false,
    conditional: false,
    logical: false,
    length: false,
    in: false,
    assignment: false,
    fndef: false,
  },
}

export function validateFormula(formula: string, evaluations: string[]) {
  if (formula.length === 0) {
    return Result.error(new BadRequestError('Formula is empty'))
  }

  if (formula.length > FORMULA_COMPLEXITY_LIMIT) {
    return Result.error(new BadRequestError('Formula is too complex'))
  }

  try {
    const parser = new Parser(FORMULA_PARSER_OPTIONS)
    const expression = parser.parse(formula)

    const scope = [FORMULA_EVALUATION_VARIABLE, FORMULA_RESULTS_VARIABLE]
    const variables = expression.variables()
    for (const variable of variables) {
      if (!scope.includes(variable)) {
        return Result.error(
          new BadRequestError(
            `Variable '${variable}' in formula is not ${FORMULA_EVALUATION_VARIABLE}() or ${FORMULA_RESULTS_VARIABLE}()`,
          ),
        )
      }
    }

    const parameters = [
      ...formula.matchAll(FORMULA_EVALUATION_VARIABLE_REGEX),
    ].map((match) => match[1]?.trim().slice(1, -1))
    for (const parameter of parameters) {
      if (!evaluations.includes(parameter)) {
        return Result.error(
          new BadRequestError(
            `Evaluation '${parameter}' in formula is not a sub-evaluation`,
          ),
        )
      }
    }
  } catch (error) {
    return Result.error(new BadRequestError((error as Error).message))
  }

  return Result.ok(formula)
}

export function combineScore(
  formula: string,
  results: CompositeEvaluationResultMetadata['results'],
) {
  const parser = new Parser(FORMULA_PARSER_OPTIONS)
  const expression = parser.parse(formula)

  const score = parseInt(
    expression
      .evaluate({
        // @ts-expect-error: The parser accepts a function with a single argument
        [FORMULA_EVALUATION_VARIABLE]: (uuid: string) => results[uuid].score,
        [FORMULA_RESULTS_VARIABLE]: () => Object.keys(results).length,
      })
      .toString(),
  )
  if (isNaN(score)) {
    throw new UnprocessableEntityError('Combined score is not a number')
  }

  return score
}

export function buildResults<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>(results: ResultWithEvaluationV2<T, M>[]) {
  const metadatas: CompositeEvaluationCustomResultMetadata['results'] = {}

  for (const { result, evaluation } of results) {
    if (result.error) {
      throw new BadRequestError(
        `Cannot combine scores from sub-evaluations with errors`,
      )
    }

    const specification = getEvaluationMetricSpecification(evaluation)
    const reason = specification.resultReason(
      result as EvaluationResultSuccessValue<T, M>,
    )

    metadatas[evaluation.uuid] = {
      uuid: result.uuid,
      name: evaluation.name,
      score: result.normalizedScore!,
      reason: reason || 'No reason reported',
      passed: result.hasPassed!,
    }
  }

  return metadatas
}
