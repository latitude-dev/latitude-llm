import { Parser, ParserOptions } from 'expr-eval'
import { CompositeEvaluationResultMetadata } from '../../../constants'
import { BadRequestError, UnprocessableEntityError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'

const FORMULA_COMPLEXITY_LIMIT = 36 * (25 + 1) + 100 // 25 evaluations + 1 results variable + 100 characters for other operators
const NUM_RESULTS_VARIABLE = 'results'

const PARSER_OPTIONS: ParserOptions = {
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

// TODO(AO): Prefix uuids with VAR_ and substitute - with _ in the formula when parsing
// Check if VAR(uuid) or VAR('uuid') is accepted instead

export function validateFormula(formula: string, evaluationUuids: string[]) {
  if (formula.length > FORMULA_COMPLEXITY_LIMIT) {
    return Result.error(new BadRequestError('Formula is too complex'))
  }

  try {
    const parser = new Parser(PARSER_OPTIONS)
    const expression = parser.parse(formula)

    const scope = [...evaluationUuids, NUM_RESULTS_VARIABLE]
    const variables = expression.variables()
    for (const variable of variables) {
      if (!scope.includes(variable)) {
        return Result.error(
          new BadRequestError(
            `Variable '${variable}' in formula is not an evaluation`,
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
  const parser = new Parser(PARSER_OPTIONS)
  const expression = parser.parse(formula)

  const values = Object.entries(results).reduce(
    (acc, [evaluationUuid, result]) => {
      acc[evaluationUuid] = result.score
      return acc
    },
    {} as Record<string, number>,
  )
  values[NUM_RESULTS_VARIABLE] = Object.keys(results).length

  const score = parseInt(expression.evaluate(values).toString())
  if (isNaN(score)) {
    throw new UnprocessableEntityError('Combined score is not a number')
  }

  return score
}
