# What LinguaAI had in Latitude V1

Reconstructed from the app code (`sdk.prompts.run("grammar-check")`, `sdk.prompts.run("vocab-quiz")`)
and the V1 feature set. The V1 workspace's trial has ended, so the prompt bodies in
`latitude-prompts/` are faithful reconstructions, not exports.

| V1 object | Name | Notes |
| --- | --- | --- |
| Project | LinguaAI (`LATITUDE_PROJECT_ID`) | one project, one published version pinned by `LATITUDE_VERSION_UUID` |
| Prompt | `grammar-check` | PromptL, parameters `text`, `language`; JSON output parsed by the app |
| Prompt | `vocab-quiz` | PromptL, parameters `language`, `difficulty`, optional `topic` |
| Evaluation (LLM-as-judge, live) | "Misses a grammar error" | on `grammar-check` logs: fail when the learner's text has an error the corrections do not cover |
| Evaluation (programmatic, batch) | "Corrected text matches label" | exact/semantic match against the dataset's `expected_output` label column |
| Dataset | `grammar-golden` | CSV with `text`, `language`, `expected_output` (marked as label), used for batch experiments before publishing |
| Human-in-the-loop | thumbs up/down on logs | reviewers annotated bad corrections from the Logs page |
| Integration | `latitude-sdk>=5.7.0`, gateway `https://gateway.latitude.so/api/v3` | every request to the model went through Latitude |
