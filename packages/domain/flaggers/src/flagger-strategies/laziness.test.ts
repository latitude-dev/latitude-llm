import { describe, expect, it } from "vitest"

import { lazinessStrategy } from "./laziness.ts"
import { assistant, assistantToolCall, makeTrace, user } from "./test-helpers.ts"

describe("lazinessStrategy.detectDeterministically", () => {
  describe("ambiguous on deferral patterns", () => {
    it("fires on 'you can try'", () => {
      const trace = makeTrace([
        user("Implement email validation."),
        assistant("You can try using a regex like /.+@.+/"),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'you could try' variant", () => {
      const trace = makeTrace([user("Sort this array."), assistant("You could try Array.prototype.sort().")])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'here's how you would'", () => {
      const trace = makeTrace([user("Parse JSON."), assistant("Here's how you would do it in Python: use json.loads.")])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'as a starting point'", () => {
      const trace = makeTrace([
        user("Write a web scraper."),
        assistant("As a starting point, install requests and beautifulsoup4."),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'use this as a template'", () => {
      const trace = makeTrace([user("Write a CRUD module."), assistant("Use this as a template for your own modules.")])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'I'll leave'", () => {
      const trace = makeTrace([
        user("Finish the test suite."),
        assistant("I'll leave the error-case tests for you to add."),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'refer to the docs'", () => {
      const trace = makeTrace([user("How does Promise.all work?"), assistant("Refer to the docs for details.")])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on '// TODO' placeholder comment", () => {
      const trace = makeTrace([
        user("Write the auth middleware."),
        assistant("```ts\nexport function auth() {\n  // TODO: implement\n}\n```"),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on '// FIXME'", () => {
      const trace = makeTrace([
        user("Fix the bug."),
        assistant("```ts\nfunction process() {\n  // FIXME: handle null\n}\n```"),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on '// your code here'", () => {
      const trace = makeTrace([
        user("Implement the function."),
        assistant("```ts\nfunction foo() {\n  // your code here\n}\n```"),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on '# TODO' python comment", () => {
      const trace = makeTrace([
        user("Write a fib function."),
        assistant("```py\ndef fib(n):\n    # TODO: implement\n```"),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on '... etc.' trailing pattern", () => {
      const trace = makeTrace([
        user("List all HTTP status codes."),
        assistant("200 OK, 404 Not Found, 500 Server Error ... etc."),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("is case-insensitive", () => {
      const trace = makeTrace([user("Write the code."), assistant("HERE'S HOW YOU WOULD approach this.")])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires when deferral phrase appears only in a later stage", () => {
      const trace = makeTrace([
        user("hello"),
        assistant("hi!"),
        user("Write the function."),
        assistant("Here's how you would implement it: ..."),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })
  })

  describe("no-match", () => {
    it("no-match when the assistant gives a substantive answer", () => {
      const trace = makeTrace([user("What's the capital of France?"), assistant("The capital of France is Paris.")])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("no-match on empty conversation", () => {
      expect(lazinessStrategy.detectDeterministically?.(makeTrace([]))).toEqual({ kind: "no-match" })
    })

    it("no-match when assistant only emits a tool call (no text to match against)", () => {
      const trace = makeTrace([user("search for pizza recipes"), assistantToolCall("search", { q: "pizza" })])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("no-match when an unrelated 'could' appears without deferral context", () => {
      const trace = makeTrace([
        user("Is this approach correct?"),
        assistant("Yes, this approach could be called memoization."),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })
  })
})
