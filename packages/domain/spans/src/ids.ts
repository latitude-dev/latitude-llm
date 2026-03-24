import { z } from "zod"

export const SESSION_ID_MAX_LENGTH = 128
export const TRACE_ID_LENGTH = 32
export const SPAN_ID_LENGTH = 16

export const sessionIdSchema = z.string().max(SESSION_ID_MAX_LENGTH)
export const traceIdSchema = z.string().length(TRACE_ID_LENGTH)
export const spanIdSchema = z.string().length(SPAN_ID_LENGTH)
