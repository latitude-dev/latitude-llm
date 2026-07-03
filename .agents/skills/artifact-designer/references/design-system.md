# Artifact UI

Artifact UI is grounded in Vercel's public Geist design system (`https://vercel.com/design.md` and `https://vercel.com/design.dark.md`) and adapted for self-contained artifacts.

Rules:

- Use the bundled Artifact UI classes and CSS variables before writing custom CSS.
- Do not import external CSS, JS, fonts, or images.
- Use semantic HTML and accessible labels.
- Use restrained neutral surfaces, high contrast text, and color only for state or hierarchy.
- Use blue for links, focus, and affirmative state; red for errors/destructive state; amber for warnings.
- Prefer borders and tonal surfaces over heavy shadows.
- Follow a 4px spacing scale.
- Use 6px radius for normal controls/cards, 12px for popovers/modals, 16px for fullscreen panels, 9999px for pills.
- Use Geist-style typography: 600 for headings, 500 for controls, 400 for body. Use mono for code, IDs, and tabular numbers.
- Motion should be instant or short and must honor `prefers-reduced-motion`.

Available classes include: `.artifact-page`, `.artifact-shell`, `.artifact-header`, `.artifact-title`, `.artifact-subtitle`, `.artifact-card`, `.artifact-grid`, `.artifact-stack`, `.artifact-row`, `.artifact-button`, `.artifact-button-primary`, `.artifact-button-secondary`, `.artifact-badge`, `.artifact-callout`, `.artifact-metric`, `.artifact-table`, `.artifact-code`, `.artifact-tabs`, `.artifact-input`.
