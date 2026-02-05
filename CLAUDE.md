# CLAUDE.md - AI Assistant Guide

This document provides comprehensive guidance for AI assistants working on the **Bullet Flow** Obsidian plugin.

## Quick Start

**Bullet Flow** is an Obsidian plugin supporting a BuJo-inspired (Bullet Journal) knowledge management workflow.

**Core Features:**
- **Extract Log** - Move nested content from daily notes to project/area notes
- **Migrate Task** - BuJo-style task migration between periodic notes
- **Custom Checkboxes** - Visual task markers (e.g., `[o]` for meetings)

**Architecture:**
- TypeScript plugin using Obsidian API
- ES6 modules with esbuild bundling
- Auto-deploy via BRAT (every push to `main` or `claude/**`)
- Comprehensive test suite with Vitest

**Essential Reading:**
1. [WORKFLOW.md](WORKFLOW.md) - Philosophy and workflow principles
2. [TESTING.md](TESTING.md) - Testing strategy and patterns
3. [docs/AUTO-DEPLOY.md](docs/AUTO-DEPLOY.md) - BRAT setup and deployment

---

## Codebase Structure

```
obsidian-tools/
├── src/                          # TypeScript plugin source
│   ├── main.ts                   # Plugin entry point
│   ├── types.ts                  # Domain types & result types
│   ├── config.ts                 # Task marker patterns & constants
│   ├── commands/                 # Command implementations
│   │   ├── extractLog.ts
│   │   ├── migrateTask.ts
│   │   ├── pushTaskDown.ts
│   │   ├── pullTaskUp.ts
│   │   ├── takeProjectTask.ts
│   │   └── dropTaskToProject.ts
│   └── utils/                    # Domain services & utilities
│       ├── commandSetup.ts       # Common command setup
│       ├── indent.ts             # Indentation utilities
│       ├── listItems.ts          # List item operations
│       ├── periodicNotes.ts      # PeriodicNoteService + functions
│       ├── projects.ts           # Project note detection & utilities
│       ├── tasks.ts              # TaskState, TaskMarker & task operations
│       └── wikilinks.ts          # LinkResolver + wikilink parsing
│
├── tests/                        # Test suite
│   ├── unit/                     # Pure function tests
│   ├── integration/              # Full workflow tests
│   ├── helpers/                  # Test utilities
│   └── mocks/                    # Obsidian API mocks
│
├── docs/                         # Documentation
├── .github/workflows/            # CI/CD
│   └── release-on-push.yml       # Auto-deploy
│
├── manifest.json                 # Plugin metadata
├── tsconfig.json                 # TypeScript config
├── esbuild.config.mjs            # Build config
├── WORKFLOW.md                   # Workflow philosophy
├── TESTING.md                    # Testing strategy
└── README.md                     # User documentation
```

---

## Workflow Philosophy

### The Core Problem

Traditional productivity systems struggle with:
1. **Capture friction** - Forcing decisions about *where* before you can write
2. **Review collapse** - Scheduled reviews fail when life gets chaotic
3. **Retrieval failure** - Analog BuJo is great for thinking, terrible for finding
4. **Infinite inbox** - Digital systems encourage endless accumulation

### The Solution: Chaos → Structure

**Morning:** Everything starts in the daily note as rapid, unorganized capture.

**Throughout Day:** Continuous capture without categorization. Use semantic bullets for visual structure.

**Reflection Passes:** Ad hoc mini-passes ask: "Is this ephemeral or does it belong somewhere longer?" Extract lasting content to Project/Area notes.

**End of Day:** BuJo-style migration - move forward, schedule for later, or explicitly drop tasks.

**Read [WORKFLOW.md](WORKFLOW.md) for complete philosophy and examples.**

### Vault Organization (PARA-lite)

```
+Diary/              # Daily, weekly, monthly, yearly notes (center of gravity)
1 Projekte/          # Time-bound projects with clear outcomes
2 Areas/             # Ongoing responsibilities
3 Ressourcen/        # Timeless resources (optional)
4 Archive/           # Completed projects (optional)
```

---

## Technical Architecture

### Runtime Environment

**Execution Context:**
- Native Obsidian plugin (TypeScript compiled to JavaScript)
- Loaded by Obsidian's plugin system
- Access to full Obsidian API via `this.app`

**Key Obsidian APIs:**
- `this.app.vault` - File operations
- `this.app.workspace` - Navigate to files, get active view/editor
- `this.app.metadataCache` - Access list item metadata
- `navigator.clipboard` - Copy extracted content
- `Notice` - User notifications

**Plugin Lifecycle:**
- `onload()` - Register commands, inject CSS
- `onunload()` - Cleanup

### Domain-Driven Design Patterns

The codebase follows DDD principles with clear separation of concerns:

**Domain Model (`src/types.ts`):**
- `NoteInfo` - Value object for periodic note identification
- `CommandResult` - Result types separating business logic from UI
- `LinkResolver` - Interface abstracting Obsidian's MetadataCache

**Domain Services (`src/utils/*.ts`):**
- `PeriodicNoteService` - Encapsulates settings for periodic note operations
- `TaskState` enum + `TaskMarker` class - Explicit task state machine
- `ObsidianLinkResolver` - Infrastructure adapter for link resolution
- Pure functions for markdown transformation

**Task State Machine:**
```
[ ] (Open)  ─┬─ migrateTask ─→ [>] (Migrated) [terminal]
[/] (Started)│
             ├─ pushDown/pullUp ─→ [<] (Scheduled) ─→ merge ─→ [ ] (Open)
             └─ complete ─→ [x] (Completed) [terminal]
```

Use `TaskMarker` for type-safe state transitions:
```typescript
import { TaskMarker, TaskState } from '../utils/tasks';

const marker = TaskMarker.fromLine('- [ ] My task');
if (marker?.canMigrate()) {
  const newLine = marker.toMigrated().applyToLine(line);
}
```

**Using PeriodicNoteService:**
```typescript
import { PeriodicNoteService } from '../utils/periodicNotes';

// Encapsulates settings - no parameter threading
const noteService = new PeriodicNoteService(plugin.settings);
const noteInfo = noteService.parseNoteType(file.basename);
const targetPath = noteService.getNextNotePath(noteInfo);
```

**Using LinkResolver:**
```typescript
import { ObsidianLinkResolver } from '../utils/wikilinks';
import type { LinkResolver } from '../types';

// Infrastructure adapter
const resolver: LinkResolver = new ObsidianLinkResolver(
  plugin.app.metadataCache,
  plugin.app.vault
);

// Domain-friendly function (no Obsidian types)
const link = findFirstResolvedLink(lineText, sourcePath, resolver);
```

**Target Heading Settings:**

Three settings control where content is inserted into notes. They are intentionally independent -- changing one does not affect the others.

| Setting | Used by | Target note type | Default |
|---|---|---|---|
| `periodicNoteTaskTargetHeading` | migrateTask, pushTaskDown, pullTaskUp, takeProjectTask | Periodic notes | `## Log` |
| `logExtractionTargetHeading` | extractLog | Project/Area notes (log entries) | `## Log` |
| `projectNoteTaskTargetHeading` | dropTaskToProject | Project notes (tasks) | `## Todo` |

### Tech Stack

**Plugin:**
- TypeScript with strict type checking
- ES6 Modules (import/export)
- Obsidian API (latest types)
- esbuild (bundler)

**Development:**
- Node.js 20+
- TypeScript 5.3+
- Vitest (test framework with mocking)
- GitHub Actions (CI/CD)

### Module System

```typescript
// ✅ CORRECT - ES6 imports/exports
import { Editor, Notice, TFile } from 'obsidian';
import type { WikiLink, NoteInfo } from './types';
import { parseWikilink } from './utils/wikilinks';

export async function extractLog(plugin: BulletFlowPlugin) {
  // Implementation
}
```

**Build Process:**
- TypeScript → esbuild → `main.js` (bundled)
- All imports resolved and bundled into single file
- Source maps for debugging

---

## Development Guidelines

### Core Design Principle: Text Transformation

This plugin adheres to Workflow Principle #8 (**Text over Logic**) and Obsidian's foundational promise that *your knowledge should last*.

**The principle:** Every operation is a direct text transformation. The markdown file *is* the state—no hidden metadata, no query layers, no computed views.

**What this means in practice:**

✅ **DO:**
- Move or copy text between files (migration, extraction)
- Leave visible markers that encode state (`[>]` migrated, `[<]` scheduled, `[x]` done)
- Use wikilinks as the paper trail for where content came from or went
- Ensure a user could understand the file's history using only a plain text editor

❌ **DON'T:**
- Add frontmatter/metadata that requires interpretation
- Create query-based views (like Dataview blocks) as part of plugin operations
- Store state outside the markdown (databases, JSON files, plugin data)
- Rely on Obsidian-specific rendering to convey meaning

**When reviewing feature suggestions:** If a proposed change stores state outside the visible markdown or requires Obsidian/plugin to interpret the file correctly, flag it as a potential violation of this principle and discuss alternatives.

### Code Organization

**Type Definitions:**
- All shared types live in `src/types.ts`
- Organized by category (List Items, Wikilinks, Periodic Notes)
- Import with `import type { TypeName } from '../types'`

**Utility Functions:**
- Pure functions in `src/utils/`
- One file per concern (wikilinks, tasks, indent, etc.)
- Mark internal utilities with `@internal` JSDoc

**Command Structure:**
```typescript
// src/commands/newCommand.ts
import { Notice } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { getActiveMarkdownFile, getListItems } from '../utils/commandSetup';

export async function newCommand(plugin: BulletFlowPlugin): Promise<void> {
  try {
    const context = getActiveMarkdownFile(plugin);
    if (!context) return;

    const { editor, file } = context;
    const listItems = getListItems(plugin, file);

    // Implementation
  } catch (e) {
    new Notice(`newCommand ERROR: ${e.message}`);
  }
}
```

**Main Plugin:**
```typescript
// src/main.ts
import { newCommand } from './commands/newCommand';

this.addCommand({
  id: 'new-command',
  name: 'New command description',
  callback: () => newCommand(this)
});
```

### Code Style

**TypeScript:**
- Use strict null checks
- Prefer `const` over `let`
- Type function parameters and returns
- Use arrow functions for callbacks

**Naming:**
- Functions: `camelCase`
- Types/Interfaces: `PascalCase`
- Files: `camelCase.ts`
- Constants: `UPPER_SNAKE_CASE`

**Error Handling:**
```typescript
try {
  await performOperation();
} catch (e) {
  new Notice(`Error: ${e.message}`);
  console.error('Detailed error:', e);
}
```

### Important Code Conventions

**❌ NEVER add planning comments to permanent code:**
```typescript
// ❌ BAD - Don't include planning artifacts
// TODO: Add file picker support in Slice 10
// NOTE: This is MVP implementation, will refactor later
// FIXME: Temporary solution until we implement feature X

// ✅ GOOD - Only document current behavior
// Returns null if no wikilink found on current line
```

**Planning comments (TODO, FIXME, MVP, Slice, etc.) should NOT appear in committed code.** They belong in:
- GitHub issues
- Pull request descriptions
- Planning documents (deleted after completion)

**❌ NEVER include stats in documentation that go out of date:**
```typescript
// ❌ BAD in docs
"Comprehensive test suite with 291 tests"
"Unit tests for utilities (95%+ coverage)"
"The plugin has 1,104 lines of code"

// ✅ GOOD in docs
"Comprehensive test suite covering all functionality"
"Unit tests for utilities"
"Well-organized codebase with clear separation of concerns"
```

Statistics are useful during development but become misleading in permanent documentation. Focus on *what* is tested, not *how many*.

---

## Testing Strategy

### Philosophy

- **Unit tests** for pure helper functions
- **Integration tests** for main workflows
- **Mock Obsidian APIs** to simulate vault operations
- **TDD approach** - Write tests first, then implement

### Test Structure

```
tests/
├── unit/                               # Pure function tests
│   ├── *.test.ts                      # TypeScript tests
├── integration/                        # Full workflow tests
│   ├── *.plugin.test.ts               # Plugin integration tests
├── helpers/                            # Test utilities
│   ├── *PluginTestHelper.ts           # Test helper functions
└── mocks/
    └── obsidian.js                    # Obsidian API mock factories
```

### Testing Pattern: Markdown-First

**Use for:** Commands that transform markdown content

**Key Insight:** Multi-line template strings make test input/expectations much easier to read:

```typescript
// ✅ GOOD - Multi-line template strings
const result = await testExtractLog({
  source: `
- Extract this [[Target Note]]
  - Child content
  - More details
`,
  targetNoteName: 'Target Note',
  targetNoteContent: `
## Existing Section

Some content
`
});

expect(result.target).toContain('## Log');
expect(result.target).toContain('Child content');

// ❌ BAD - Concatenated strings are hard to read
const result = await testExtractLog({
  source: '- Extract this [[Target Note]]\n  - Child content\n  - More details\n',
  targetNoteName: 'Target Note',
  targetNoteContent: '## Existing Section\n\nSome content\n'
});
```

**Benefits of template strings:**
- Tests read like user stories
- Easy to see input → output transformation
- Natural indentation matches markdown structure
- Clear whitespace handling

### Mock Architecture

**Factory Functions in `/tests/mocks/obsidian.js`:**
- `createMockEditor(content)` - Mock editor
- `createMockMetadataCache(file, listItems)` - Mock metadata
- `createMockVault()` - Mock vault operations
- `createMockApp()` - Mock app with vault, workspace, cache

**Global Mocks:**
```javascript
vi.stubGlobal('Notice', vi.fn());
navigator.clipboard.writeText = vi.fn();
```

### Running Tests

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode (TDD)
npm run test:coverage # Coverage report
npm run test:ui       # Interactive UI
```

---

## Documentation Conventions

### User-Focused Documentation

When updating user-facing documentation (README.md, CHANGELOG.md), focus on **what users care about**, not internal development details.

**CHANGELOG.md Best Practices:**

```markdown
<!-- ❌ BAD - Inside baseball -->
## [0.2.0] - 2026-01-25

**Slice 7: Polish & UX**
- Inject custom checkbox CSS directly in plugin
- Removed test command
- Updated main.ts (44 insertions, 10 deletions)

**Slice 6: Complete migrateTask Implementation**
- Ported all 46 legacy unit tests
- Created periodicNotes.ts utility
- Fixed mobile selection detection using editor.listSelections()

<!-- ✅ GOOD - User perspective -->
## [0.2.0] - 2026-01-25

### Added
- Custom checkbox CSS now injected automatically (no manual setup)
- Multi-select task migration (select multiple tasks at once)
- All periodic note types supported (weekly, monthly, yearly)
- Boundary transitions (Sunday → weekly, December → yearly)

### Improved
- Better mobile support for text selection
- Handles YAML frontmatter when inserting content

### Fixed
- Task migration now works reliably on mobile devices
```

**Key differences:**
- ✅ Features users will notice
- ✅ Problems that are now solved
- ✅ Improvements to workflows
- ❌ Implementation details (file names, line counts)
- ❌ Development phases (slices, MVPs)
- ❌ Test counts or coverage stats

Ask yourself: **"Would a user care about this, or is it just development noise?"**

---

## Common Development Tasks

### Adding a New Command

1. **Create command file** - `src/commands/newCommand.ts`
2. **Create utilities** - `src/utils/newHelper.ts` (if needed)
3. **Add types** - Update `src/types.ts` if new types needed
4. **Write unit tests** - `tests/unit/newHelper.test.ts`
5. **Write integration tests** - `tests/integration/newCommand.test.ts`
6. **Create test helper** - `tests/helpers/newCommandTestHelper.ts`
7. **Register command** - Add to `src/main.ts`

**Template:**
```typescript
// src/commands/newCommand.ts
import { Notice } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { getActiveMarkdownFile, getListItems } from '../utils/commandSetup';

export async function newCommand(plugin: BulletFlowPlugin): Promise<void> {
  try {
    const context = getActiveMarkdownFile(plugin);
    if (!context) return;

    const { editor, file } = context;
    // Implementation

    new Notice('newCommand: Success!');
  } catch (e) {
    new Notice(`newCommand ERROR: ${e.message}`);
    console.error('newCommand error:', e);
  }
}
```

### Adding Tests to Existing Code

1. **Read the code** - Understand current structure
2. **Identify pure functions** - Functions with no side effects
3. **Choose test pattern** - Markdown-first for transformations
4. **Write unit tests** - For each helper function
5. **Write integration tests** - For main workflow
6. **Use template strings** - For markdown test cases

### Refactoring Code

1. **Write tests first** - Ensure current behavior is captured
2. **Make small changes** - One refactor at a time
3. **Keep tests passing** - Green → refactor → green
4. **Update types** - Keep `types.ts` synchronized
5. **Remove dead code** - Don't leave commented-out code

---

## Key Insights

### Periodic Notes

**ISO Week Numbering:**
- Week 1 contains the first Thursday of the year
- Week 1 always contains January 4th
- Weeks start on Monday, end on Sunday
- Some years have 53 weeks (e.g., 2020, 2026)

**Our Implementation:**
- `getISOWeekNumber()` - Calculates week number from date
- `getMondayOfISOWeek()` - Gets Monday of a given week
- **Verified correct** against ISO 8601 spec and date-fns
- Handles edge cases: year boundaries, leap years, DST

**Boundary Rules:**
- Daily (Sunday) → next Weekly
- Weekly → always next Weekly
- Monthly (December) → next Yearly
- Yearly → always next Yearly

### Wikilink Parsing

**Formats Supported:**
- `[[Note]]` - Simple link
- `[[Note|Alias]]` - Link with alias
- `[[Note#Section]]` - Link to section
- `[[Note#Section|Alias]]` - Section link with alias

**Edge Cases:**
- Multiple `|` in alias (e.g., `[[Note|Some|Text]]`) - last parts are alias
- Multiple `#` in section (e.g., `[[Note#A#B]]`) - last parts are section
- Nested wikilinks stripped from display text to avoid `[[...]]` in section anchors

### List Item Hierarchy

**Obsidian Metadata Cache:**
- Provides `listItems` array with position and parent relationships
- Parent is line number of parent item (-1 for top-level)
- Used to find children without parsing markdown manually

**Finding Children:**
- Walk listItems to find direct children
- Check `parent` field matches current line
- Recursively find all descendants using `isDescendantOf()`

---

## References

- [Obsidian API Documentation](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [ISO 8601 Week Date Specification](https://en.wikipedia.org/wiki/ISO_week_date)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Vitest Documentation](https://vitest.dev/)

---

## Summary: AI Assistant Checklist

When working on this codebase:

✅ **Always:**
- Use TypeScript with ES6 imports/exports
- Add types to `src/types.ts` for shared definitions
- Use `TaskMarker` for task state transitions (type-safe)
- Use `PeriodicNoteService` for periodic note operations (cleaner API)
- Write tests first (TDD)
- Use multi-line template strings for markdown test cases
- Focus user documentation on user-visible changes
- Keep code comments focused on current behavior
- Update CHANGELOG.md when bumping versions

❌ **Never:**
- Add planning comments (TODO, MVP, Slice, etc.) to permanent code
- Include statistics in documentation that will go out of date
- Write inside-baseball CHANGELOG entries
- Test Obsidian internals (trust the framework)
- Skip type definitions for shared interfaces
- Expose Obsidian types (`TFile`) in domain interfaces (use `LinkResolver`)

⚠️ **When in doubt:**
- Read [WORKFLOW.md](WORKFLOW.md) to understand "why"
- Check existing test patterns
- Keep it simple - this system values simplicity over sophistication

---

**Last Updated:** 2026-01-27
**Repository:** [nfelger/obsidian-tools](https://github.com/nfelger/obsidian-tools)
