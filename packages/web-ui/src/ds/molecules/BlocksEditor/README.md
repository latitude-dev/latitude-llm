# BlocksEditor

A Notion-like, block-based editor built with Lexical that enforces hierarchical content structure. The editor supports custom blocks with strict nesting rules to maintain content organization and prevent invalid configurations.

## Overview

The BlocksEditor is designed to handle structured content through a hierarchy of custom blocks. It only accepts and emits block arrays (not strings) and provides full editing capabilities with cursor movement between and inside blocks.

## Hierarchy Rules

The editor enforces strict hierarchical rules to prevent invalid content structures:

### Rule 1: Paragraph Blocks (Most Restrictive)

```
Paragraph Block
├── ✅ Regular Lexical nodes (TextNode, etc.)
└── ❌ NO custom blocks (messages, steps, paragraphs)
```

### Rule 2: Message Blocks (Medium Restrictive)

```
Message Block
├── ✅ Paragraph blocks
├── ✅ Regular Lexical nodes
├── ❌ NO other message blocks
└── ❌ NO step blocks
```

### Rule 3: Step Blocks (Least Restrictive)

```
Step Block
├── ✅ Message blocks (any role)
├── ✅ Paragraph blocks
├── ✅ Regular Lexical nodes
└── ❌ NO other step blocks
```

### Rule 4: Root Level (No Restrictions)

```
Root Level
├── ✅ Any block type
├── ✅ Step blocks
├── ✅ Message blocks
└── ✅ Paragraph blocks
```
