# Agent Score snapshot assets

Design: [Latitude Sandbox, snapshot section](https://www.figma.com/design/nKsbDsFDH43cK9mJen4fKh/Latitude-Sandbox?node-id=7229-144834).
The 1270 × 1270 compositions are nodes `7229:144639` (blue), `7229:144686` (green), and `7229:144785` (red).

- `background-blue.png`, `background-green.png`, `background-red.png`: original user-supplied `bg1.png`, `bg2.png`, `bg3.png`, copied without modification.
- `headline.svg`: “My Agent Vitality is”, outlined from Circular Std Bold with the design’s 109.375px size and −1.09375px tracking.
- `wordmark.svg`, `benchmark.svg`: transparent outlined Figma text exports (contents only) from nodes `7229:144646` and `7229:144647`. Exports have tight artwork bounds; the renderer positions them by their absolute render bounds rather than their text boxes.
- `logo.svg`: Figma export from node `7229:144679`, rotated −90° by the renderer as in the design.
- Inter font files: unmodified [Inter v4.1](https://github.com/rsms/inter/tree/v4.1/docs/font-files), distributed under the bundled SIL Open Font License. Static Circular Std lettering is preserved in the Figma artwork exports.

The snapshot renderer owns layout and live score discs. Dashboard colors are independent of this template.
