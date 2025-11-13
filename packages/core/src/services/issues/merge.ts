// TODO(AO): implement this

/*
- check LATITUDE_CLOUD
- Search the candidate-related issues by cosine similarity on their centroid embedding. Filter by 80% similarity.
- Select the biggest issue, the issue with the most all-time events (biggest histogram count). (Note respect the biggest issue state, maybe it is resolved/ignored, that means that it will continue to be ignored or go to escalating because new events are discovered)
- Relink in bulk all evaluation results tied to the losing issues to the winning issue.
- Relink all evaluations tied to the losing issues to the winning issue.
- Recompute the winning issue's centroid embedding with the losing issues centroid embedding.
- Update winning issue's centroid in vector db
- Remove losing issues from vector db
- Insert/Update in bulk the winning issue histogram with the historic losing issue histograms. HOWEVER, leave the losing issue histograms as they are to have some traceability in the ui.
- Mark the other losing issues as "merged". This will filter out the issues in the dashboard.
- Enqueue generateIssueDetails job
- Publish issueMerged event
- Evaluations from the merged issues `evaluation.issueId` has to be `ignoredAt`. This data migration is not implemented yet. Also we should update the evaluations UI at some point to reflect this.
- Add a pointer from `merged` issue to `winning` issue for traceability (make a new column issue.mergedToIssueId)
*/
