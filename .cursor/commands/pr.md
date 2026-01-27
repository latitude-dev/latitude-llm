# pr

Generate a branch name, Pull Request title, and description summarizing the net effect of all changes made in this conversation.

Constraints:
- Do NOT apply or suggest code changes.
- Do NOT describe individual files, components, or services.
- Focus on the problem addressed and the resulting behavior or logic change.
- Use neutral, implementation-agnostic language.

Output requirements:
- Branch name: very short, lowercase, kebab-case, describing the intent or behavior change.
- PR Title: one concise line describing the primary intent or behavioral change.
- PR Description: markdown-formatted and structured as specified below.

Template:
```md
## Summary
High-level description of the problem and the logical change introduced.

[Optional: additional context or rationale only if the change is non-trivial]
```

Output must be:
> ## Branch name
> ```
> branch-name
> ```

> ## PR Title
> ```
> PR Title
> ```
>
> ## PR Description
> ```md
> PR Description
> ```
