import { isHttpError } from "@repo/utils"
import * as Cause from "effect/Cause"
import type * as Exit from "effect/Exit"

const isExpectedClientHttpError = (error: unknown): boolean =>
  isHttpError(error) && error.httpStatus >= 400 && error.httpStatus < 500

const failErrorsFromExit = (exit: Exit.Exit<unknown, unknown>): unknown[] => {
  if (exit._tag !== "Failure") return []
  return exit.cause.reasons.flatMap((reason) => (reason._tag === "Fail" ? [reason.error] : []))
}

export const exitHasOnlyExpectedClientErrors = (exit: Exit.Exit<unknown, unknown>): boolean => {
  if (exit._tag !== "Failure" || Cause.hasInterruptsOnly(exit.cause)) return false
  const errors = failErrorsFromExit(exit)
  return errors.length > 0 && errors.every(isExpectedClientHttpError)
}
