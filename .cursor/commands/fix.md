# issue

Read the provided bug report/issue/task.

Then thoroughly investigate the codebase to understand the relevant context:
- Find the entry points involved (routes/handlers/jobs/commands) and trace the execution path that leads to the reported behavior.
- Identify the data flow and state involved (inputs, validation, persistence, caching, permissions, feature flags, side effects).
- Locate the expected behavior (specs/tests/docs) and compare it to the actual behavior in code.
- If the report includes steps to reproduce, map each step to the corresponding code path and decision points.
- Consider common edge cases (null/empty values, timing/race conditions, retries, idempotency, pagination, timezones, auth, stale cache).

Deliverable:
Explain, in your own words:
1) What you believe the issue is (observable behavior + when it happens),
2) Why you believe it is happening (root cause and the specific assumption/logic that breaks),
3) How you would fix it (proposed approach and what behavior/logic should change),
4) What you would verify (minimal set of checks/tests/logs to confirm the fix and prevent regressions).

Constraints:
- Do not apply any changes automatically.
- Avoid listing files/components/services unless strictly necessary to support the explanation.
- If the codebase does not contain enough context to be confident, explicitly say what’s missing and what evidence would confirm the hypothesis.
