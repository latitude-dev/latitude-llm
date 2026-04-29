<!--
Operator notes for `benchmark:optimize --target flaggers:jailbreaking`.

This file is read at run start and appended to the proposer system prompt
as soft guidance. HTML comments are stripped before the proposer sees the
file — keep operator-facing scaffolding in comments and operator-to-proposer
guidance in the body.

Use cases:
 - Discourage a dependency you don't want adopted in this strategy
   ("avoid `tldts`").
 - Express a taste preference ("prefer regex over heuristic scoring").
 - Persist rejection rationale across runs ("a previous winner used
   X; the team rejected because Y, please don't go down that path").

Leave the body as-is if you have no preference for this run.
-->

The operator running this optimization has not expressed
preferences. Use your best judgment based on the trajectories.
