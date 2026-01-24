# CLAUDE.md - AI Assistant Guide

This document provides comprehensive guidance for AI assistants working on the **Bullet Flow** Obsidian plugin. Read this first to understand the system's philosophy, technical architecture, and development conventions.

## 🚨 MIGRATION IN PROGRESS

**Current Status:** Migrating from Templater user scripts → Native Obsidian plugin

**Completed:**
- ✅ Slice 1: Plugin scaffold with TypeScript + esbuild
- ✅ Slice 2: BRAT auto-deploy (every push auto-updates mobile/desktop)

**Next Up:**
- 🔄 Slice 3: extractLog MVP (basic extraction working)
- ⏳ Slice 4-9: Full feature implementation, testing, docs

**Key Change:** We can now use ES6 modules, split files, and leverage TypeScript!

---

## Quick Start

**What This Is:** "Bullet Flow" - An Obsidian plugin supporting a BuJo-inspired (Bullet Journal) knowledge management workflow.

**Core Features:**
- **Extract Log** - Move nested content from daily notes to project/area notes
- **Migrate Task** - BuJo-style task migration between periodic notes
- **Custom Checkboxes** - Visual task markers (e.g., `[o]` for meetings)

**Current Architecture:**
- **Plugin:** TypeScript, ES6 modules, Obsidian API
- **Legacy Scripts:** `scripts/` folder contains original Templater scripts (reference during migration)
- **Auto-Deploy:** Every push to `main` or `claude/**` creates new release via BRAT

**Essential Reading:**
1. This file (CLAUDE.md) - Current state, architecture, conventions
2. [WORKFLOW.md](WORKFLOW.md) - Philosophy and "why" (unchanged)
3. [docs/AUTO-DEPLOY.md](docs/AUTO-DEPLOY.md) - BRAT setup and semver lessons
4. [TESTING.md](TESTING.md) - Testing strategy (to be updated)

## Table of Contents

1. [Codebase Structure](#codebase-structure)
2. [Workflow Philosophy](#workflow-philosophy)
3. [Technical Architecture](#technical-architecture)
4. [Critical Constraints](#critical-constraints)
5. [Development Conventions](#development-conventions)
6. [Testing Strategy](#testing-strategy)
7. [Common Tasks](#common-tasks)
8. [References](#references)

---

## Codebase Structure

```
obsidian-tools/
├── src/                          # NEW - TypeScript plugin source
│   ├── main.ts                   # Plugin entry point
│   ├── commands/                 # Command implementations (TO BE CREATED)
│   │   ├── extractLog.ts
│   │   └── migrateTask.ts
│   └── utils/                    # Shared utilities (TO BE CREATED)
│       ├── indent.ts
│       ├── listItems.ts
│       └── wikilinks.ts
│
├── scripts/                      # LEGACY - Templater scripts (keep as reference)
│   ├── extractLog.js             # ~520 LOC - reference for migration
│   ├── migrateTask.js            # ~370 LOC - reference for migration
│   └── handleNewNote.js          # ~58 LOC - NOT migrating (deleted later)
│
├── snippets/                     # CSS (will be injected by plugin)
│   └── custom-checkboxes.css    # [o] meeting marker
│
├── tests/                        # Test suite (to be migrated to TypeScript)
│   ├── unit/                     # Pure function tests
│   ├── integration/              # Full workflow tests
│   ├── helpers/                  # Test utilities
│   └── mocks/                    # Obsidian API mocks
│
├── docs/                         # NEW - Documentation
│   └── AUTO-DEPLOY.md            # BRAT setup and semver lessons
│
├── .github/workflows/            # NEW - CI/CD
│   └── release-on-push.yml       # Auto-deploy to BRAT
│
├── manifest.json                 # NEW - Plugin metadata
├── tsconfig.json                 # NEW - TypeScript config
├── esbuild.config.mjs            # NEW - Build config
├── versions.json                 # NEW - Version compatibility
├── WORKFLOW.md                   # Workflow philosophy (unchanged)
├── TESTING.md                    # Testing strategy
├── README.md                     # Project overview
├── package.json                  # NPM config (TypeScript deps added)
└── vitest.config.js              # Test framework config
```

### Current State (Slice 2 Complete)

**Working:**
- ✅ TypeScript build pipeline (esbuild)
- ✅ Plugin loads in Obsidian
- ✅ GitHub Actions auto-deploy
- ✅ BRAT installation and updates
- ✅ Test command works on mobile/desktop

**In Progress:**
- 🔄 Migrating `extractLog.js` → `src/commands/extractLog.ts`
- 🔄 Migrating `migrateTask.js` → `src/commands/migrateTask.ts`

**Not Started:**
- ⏳ Utility extraction to `src/utils/`
- ⏳ Test migration to TypeScript
- ⏳ CSS injection in plugin
- ⏳ Documentation updates

---

## Workflow Philosophy

### The Core Problem This Solves

Traditional productivity systems (GTD, PARA, task apps) struggle with:
1. **Capture friction** - Forcing decisions about *where* before you can write
2. **Review collapse** - Scheduled reviews fail when life gets chaotic
3. **Retrieval failure** - Analog BuJo is great for thinking, terrible for finding
4. **Infinite inbox** - Digital systems encourage endless accumulation

### The Solution: Chaos → Structure

**Morning:** Everything starts in the daily note (`YYYY-MM-DD ddd`) as a rapid, unorganized log.

**Throughout Day:** Continuous capture without categorization. Use semantic bullets (checkboxes, custom markers) for visual structure.

**Reflection Passes:** Ad hoc mini-passes throughout the day ask: "Is this ephemeral or does it belong somewhere longer?" Extract lasting content to Project/Area notes.

**End of Day:** BuJo-style migration - move forward, schedule for later, or explicitly drop tasks.

### 10 Core Principles

1. **Simplicity** - Start simple; complexity emerges only when needed
2. **Frictionless Capture** - One entry point, no decisions required
3. **Expect Chaos** - Messiness is allowed; transformation happens later
4. **Continuous Review** - Reflection is woven in, not scheduled separately
5. **Resilience** - Works when life is chaotic, not just when disciplined
6. **Lightness** - No guilt, no overdue backlogs, no psychological drag
7. **Findability** - If you can't find it fast, it doesn't exist
8. **Text over Logic** - Clarity beats abstraction; redundancy is acceptable
9. **One System** - Work and life live together; no artificial boundaries
10. **Flexibility** - Structure adapts to context-switching

**Read [WORKFLOW.md](WORKFLOW.md) for complete philosophy and examples.**

### Vault Organization (PARA-lite)

```
+Diary/              # Daily, weekly, monthly, yearly notes (center of gravity)
1 Projekte/          # Time-bound projects with clear outcomes
2 Areas/             # Ongoing responsibilities
3 Ressourcen/        # Timeless resources (optional, evolving)
4 Archive/           # Completed projects and old notes (optional)
```

---

## Technical Architecture

### Runtime Environment

**Execution Context:**
- Runs as **native Obsidian plugin** (not via Templater)
- TypeScript compiled to JavaScript via esbuild
- Loaded by Obsidian's plugin system
- Access to full Obsidian API via `this.app`

**Key Obsidian APIs Used:**
- `this.app.vault` - File operations (create, delete, read, modify)
- `this.app.workspace` - Navigate to files, get active view/editor
- `this.app.metadataCache` - Access list item metadata (line numbers, children, parent)
- `navigator.clipboard` - Copy extracted content
- `Notice` - User notifications

**Plugin Lifecycle:**
- `onload()` - Register commands, inject CSS, initialize settings
- `onunload()` - Cleanup (remove CSS, etc.)

### Tech Stack

**Plugin (Production):**
- TypeScript (ES6+ with type safety)
- ES6 Modules (import/export)
- Obsidian API (latest types from `npm install obsidian`)
- esbuild (bundler - fast, simple)

**Development:**
- Node.js 20+ (dev environment)
- TypeScript 5.3+
- Vitest (test framework with built-in mocking)
- @vitest/ui (interactive test UI)
- @vitest/coverage-v8 (code coverage)
- GitHub Actions (CI/CD for auto-deploy)

**Legacy (Templater Scripts - Reference Only):**
- JavaScript ES6+, CommonJS modules
- Single-file constraint
- See `scripts/` folder for original implementation

### Module System

**TypeScript Plugin - ES6 Modules:**
```typescript
// ✅ CORRECT - ES6 imports/exports
import { Editor, Notice, TFile } from 'obsidian';
import { parseWikilink } from '../utils/wikilinks';

export async function extractLog(plugin: BulletFlowPlugin) {
  // Implementation
}

export function helperFunction() {
  // Helpers can be in same or different files
}
```

**Main Plugin Structure:**
```typescript
// src/main.ts
import { Plugin } from 'obsidian';
import { extractLog } from './commands/extractLog';

export default class BulletFlowPlugin extends Plugin {
  async onload() {
    this.addCommand({
      id: 'extract-log',
      name: 'Extract log to linked note',
      callback: () => extractLog(this)
    });
  }
}
```

**Build Process:**
- TypeScript → esbuild → `main.js` (bundled)
- All imports resolved and bundled into single file
- Source maps for debugging

---

## Plugin Development Guidelines

### ✅ What You CAN Do Now (vs Templater Scripts)

**File Organization:**
- ✅ Split code into multiple files (commands, utils, types)
- ✅ Create shared utility modules
- ✅ Organize by feature or function
- ✅ Extract reusable helpers to `src/utils/`

**Module System:**
- ✅ Use ES6 imports/exports
- ✅ Import from `obsidian` package
- ✅ Import custom utilities
- ✅ Type-safe imports with TypeScript

**Type Safety:**
- ✅ TypeScript for all plugin code
- ✅ Full Obsidian API types
- ✅ Custom type definitions
- ✅ Strict null checks enabled

**Example Structure:**
```typescript
// src/utils/wikilinks.ts
import { TFile } from 'obsidian';

export function parseWikilink(text: string): WikiLink | null {
  // Implementation
}

// src/commands/extractLog.ts
import { Notice } from 'obsidian';
import { parseWikilink } from '../utils/wikilinks';
import type BulletFlowPlugin from '../main';

export async function extractLog(plugin: BulletFlowPlugin) {
  const app = plugin.app;  // Access app via plugin instance
  const link = parseWikilink(text);  // Use imported utility
  new Notice('Done!');
}
```

### 🚫 Constraints That Still Apply

**Obsidian API Limitations:**
- Must use Obsidian API for file operations (not Node.js fs)
- Editor access only in active markdown views
- Metadata cache updates may lag file changes

**Build Requirements:**
- esbuild bundles everything into `main.js`
- All TypeScript must compile successfully
- No runtime dependencies (all bundled)

**BRAT Auto-Deploy:**
- Version in `manifest.json` must be ≥ latest dev version
- Each push creates `{version}-dev.{run_number}` release
- Dev versions use semantic versioning (`0.2.0-dev.9` < `0.2.0-dev.10`)

### 📋 Migration-Specific Constraints

**During Migration (Temporary):**
- Keep legacy scripts in `scripts/` for reference
- Don't modify legacy scripts (migration target only)
- Tests will be migrated after core functionality works

**File Organization During Migration:**
```
src/
├── main.ts                    # Plugin entry point
├── commands/                  # One file per command
│   ├── extractLog.ts         # Migrate from scripts/extractLog.js
│   └── migrateTask.ts        # Migrate from scripts/migrateTask.js
└── utils/                    # Shared utilities
    ├── indent.ts             # Extracted from both commands
    ├── listItems.ts          # Extracted from both commands
    └── wikilinks.ts          # Specific to extractLog
```

### 🎯 Code Style Guidelines

**TypeScript:**
- Use strict null checks
- Prefer `const` over `let`
- Use arrow functions for callbacks
- Type function parameters and returns

**Naming:**
- Functions: `camelCase`
- Types/Interfaces: `PascalCase`
- Files: `camelCase.ts`
- Constants: `UPPER_SNAKE_CASE`

**Imports:**
```typescript
// ✅ CORRECT - Grouped and ordered
import { Plugin, Notice, TFile } from 'obsidian';  // External first
import type { WikiLink } from '../types';          // Types
import { parseWikilink } from '../utils/wikilinks'; // Relative imports last
```

**Error Handling:**
```typescript
// ✅ CORRECT - User-friendly notices
try {
  await performOperation();
} catch (e) {
  new Notice(`Error: ${e.message}`);
  console.error('Detailed error:', e);
}
```

---

## Migration Strategy

### Approach: End-to-End Vertical Slices

Each slice delivers a working, testable increment that auto-deploys via BRAT.

**Completed Slices:**
1. ✅ **Hello Plugin** - Minimal working plugin (test command)
2. ✅ **BRAT Walking Skeleton** - Auto-deploy on every push

**Upcoming Slices:**
3. 🔄 **extractLog MVP** - Basic extraction (cursor-based, simple wikilinks)
4. ⏳ **extractLog Complete** - Edge cases (pure links, sections, full tests)
5. ⏳ **migrateTask MVP** - Daily note migration
6. ⏳ **migrateTask Complete** - All periodic note types, full tests
7. ⏳ **Polish & UX** - CSS injection, ribbon icons, settings
8. ⏳ **Documentation** - Update all docs for plugin
9. ⏳ **Official Release** - v1.0.0 to Obsidian community plugins

### Slice 3 Goals (extractLog MVP)

**Scope:**
- ✅ Extract single bullet with `[[wikilink]]` to target note
- ✅ Create `## Log` section if missing
- ✅ Copy to clipboard
- ✅ Show success notice
- ❌ NOT: Pure link bullets, section links, complex edge cases

**Deliverables:**
- `src/commands/extractLog.ts` (~300 LOC)
- `src/utils/wikilinks.ts` - findFirstWikiLink(), parseWikilink()
- `src/utils/indent.ts` - countIndent(), dedentLines()
- `src/utils/listItems.ts` - findChildrenBlockFromListItems()
- Registered command in `src/main.ts`
- Basic integration test (proves approach works)
- Working on mobile/desktop via auto-deploy

**Success Criteria:**
- Can extract bullet with children to target note in real daily workflow
- Auto-deploys to mobile on push
- One integration test passing
- Ready for daily use (even with limited features)

### Code Migration Pattern

**From Templater Script:**
```javascript
// scripts/extractLog.js (legacy)
function parseWikilink(text) {
  // Implementation
}

async function extractLog(tp) {
  const app = tp.app;
  const view = app.workspace.activeLeaf.view;
  // ...
}

module.exports = extractLog;
module.exports.parseWikilink = parseWikilink;
```

**To Plugin Command:**
```typescript
// src/utils/wikilinks.ts
import { TFile } from 'obsidian';

export function parseWikilink(text: string): WikiLink | null {
  // Implementation (same logic, typed)
}

// src/commands/extractLog.ts
import { MarkdownView, Notice } from 'obsidian';
import { parseWikilink } from '../utils/wikilinks';
import type BulletFlowPlugin from '../main';

export async function extractLog(plugin: BulletFlowPlugin) {
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  if (!view) {
    new Notice('No active markdown view');
    return;
  }
  // Implementation (adapted for plugin API)
}

// src/main.ts
import { extractLog } from './commands/extractLog';

export default class BulletFlowPlugin extends Plugin {
  async onload() {
    this.addCommand({
      id: 'extract-log',
      name: 'Extract log to linked note',
      callback: () => extractLog(this)
    });
  }
}
```

**Key Changes:**
1. Extract utilities to separate files
2. Add TypeScript types
3. Access `app` via `plugin.app` instead of `tp.app`
4. Use `getActiveViewOfType(MarkdownView)` instead of `activeLeaf.view`
5. Register as command callback instead of template function

---

## Development Conventions

### Code Style

**Production Scripts:**
- Modern JavaScript (ES6+): `const`, `let`, arrow functions, template literals, etc.
- CommonJS modules only (no ES6 import/export)
- Comprehensive inline comments explaining complex logic
- Single-file constraint: all helpers in same file

**Test Code:**
- Modern JavaScript (ES6+)
- Clear, descriptive test names
- Arrange-Act-Assert pattern
- Extensive comments explaining test scenarios

### Naming Conventions

- **Scripts:** camelCase (extractLog.js, handleNewNote.js)
- **Test files:** `*.test.js` (unit), `*.integration.test.js` (integration)
- **Helper files:** `*TestHelper.js`, `*Parser.js`
- **Mock files:** Plain descriptive names (obsidian.js)

### Git Workflow

- Feature branches with descriptive names
- Small, focused commits
- Commit messages: "Add unit tests for X helper (TDD)" or "Refactor X with Y pattern"
- Merge via pull requests
- Recent example: PR #4 (comprehensive test infrastructure)

### Documentation Style

- **Inline comments:** Explain complex logic, not obvious code
- **JSDoc comments:** Used in test helpers for API documentation
- **Markdown docs:** For workflow philosophy (WORKFLOW.md), testing strategy (TESTING.md)
- **No excessive documentation:** Prefer clear code over extensive comments

---

## Testing Strategy

### Philosophy

- **Unit tests** for pure helper functions (95%+ coverage goal)
- **Integration tests** for main workflows (60-80% coverage expected)
- **Mock Obsidian APIs** to simulate vault operations
- **TDD approach** - Write tests first, then implement

### Test Structure

```
tests/
├── unit/                           # Pure function tests
│   ├── extractLog.test.js         # ~470 lines
│   └── migrateTask.test.js        # ~390 lines
│
├── integration/                    # Full workflow tests
│   ├── extractLog.integration.test.js      # ~235 lines
│   ├── migrateTask.integration.test.js     # ~280 lines
│   └── handleNewNote.integration.test.js   # ~122 lines
│
├── helpers/                        # Test utilities
│   ├── extractLogTestHelper.js            # Markdown-first pattern
│   ├── migrateTaskTestHelper.js           # Markdown-first pattern
│   ├── handleNewNoteTestHelper.js         # UI workflow pattern
│   └── markdownParser.js                  # Parse markdown → listItems
│
└── mocks/                          # Obsidian API mocks
    └── obsidian.js                # Factory functions
```

### Two Testing Patterns

#### Pattern 1: Markdown-First Testing

**Use for:** Scripts that transform markdown content (like extractLog.js)

**Approach:**
- Accept markdown strings as input
- Return transformed markdown as output
- State tracking captures all modifications during execution
- Test helper hides mock complexity

**Example:**
```javascript
const result = await testExtractLog({
  sourceContent: `
- Extract this [[Target Note]]
  - Child content
`,
  targetNoteName: 'Target Note',
  targetNoteContent: ''
});

expect(result.targetContent).toContain('## Log');
expect(result.targetContent).toContain('Child content');
```

**Benefits:**
- Tests read like user stories
- Easy to see input → output transformation
- Minimal mock setup in test code

**See:** `tests/integration/extractLog.integration.test.js`

#### Pattern 2: UI Workflow Testing

**Use for:** Scripts that orchestrate file operations and UI (like handleNewNote.js)

**Approach:**
- Accept configuration objects (folders, user choices)
- Return structured results (what was displayed, created, opened)
- Test helper manages all mocking
- Tests focus on user interactions

**Example:**
```javascript
const result = await testHandleNewNote({
  noteTitle: 'My Note',
  folders: ['1 Projekte/', '2 Areas/'],
  userChoice: '1 Projekte/'
});

expect(result.deleted).toBe('My Note.md');
expect(result.created).toBe('1 Projekte/My Note.md');
expect(result.opened).toBe('1 Projekte/My Note.md');
```

**Benefits:**
- Clear separation of test data and assertions
- Easy to test different user choices
- Tracks state changes rather than content

**See:** `tests/integration/handleNewNote.integration.test.js`

### Mock Architecture

**Factory Functions in `/tests/mocks/obsidian.js`:**
- `createMockTFile(path, basename)` - Mock file objects
- `createMockEditor(content)` - Mock editor with getLine, getCursor
- `createMockMetadataCache(sourceFile, listItems)` - Mock list metadata
- `createMockVault()` - Mock vault operations (read, modify, create, delete)
- `createMockWorkspace()` - Mock workspace (getLeaf, openFile)
- `createMockApp()` - Mock app with vault, workspace, metadataCache
- `createMockTp()` - Mock Templater object

**Global Mocks:**
- `vi.stubGlobal('app', mockApp)` - Obsidian app object
- `vi.stubGlobal('Notice', vi.fn())` - Notification API
- `navigator.clipboard.writeText = vi.fn()` - Clipboard API

### Running Tests

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode (TDD)
npm run test:coverage # Generate coverage report
npm run test:ui       # Interactive UI
```

### Coverage Configuration

**Target:** 75% across all metrics (lines, functions, branches, statements)

```javascript
// vitest.config.js
coverage: {
  provider: 'v8',
  include: ['scripts/**/*.js'],
  thresholds: {
    lines: 75,
    functions: 75,
    branches: 75,
    statements: 75
  }
}
```

### When to Use Which Test Type

**Unit Tests:**
- Testing pure functions (no side effects)
- Complex logic needing edge case coverage
- Fast feedback (run instantly)

**Integration Tests:**
- Testing main workflow end-to-end
- Validating markdown transformations
- Ensuring multiple components work together

**Don't Test:**
- Obsidian internals (trust the framework)
- Third-party libraries (trust their tests)
- Simple getters/setters with no logic

---

## Common Tasks

### Adding a New Script

1. **Create the script file** in `scripts/` directory
2. **Use CommonJS exports** - export main function and helpers
3. **Write tests first** (TDD approach)
4. **Implement the function**
5. **Test in Obsidian** - Verify it works in Templater
6. **Document if needed** - Add to README if it's a major feature

**Example structure:**
```javascript
// scripts/myNewScript.js

function helper() {
  // Logic here
}

async function mainFunction(tp) {
  // Use helper
}

// Export main function directly, attach helpers as properties
module.exports = mainFunction;
module.exports.mainFunction = mainFunction;
module.exports.helper = helper;
```

### Adding Tests to Existing Script

1. **Read the script** - Understand current structure
2. **Identify pure functions** - Functions with no side effects
3. **Export helpers** - Add to module.exports if not already exported
4. **Choose test pattern** - Markdown-first or UI workflow
5. **Write unit tests** - For each helper function
6. **Write integration tests** - For main function workflow
7. **Verify coverage** - Run `npm run test:coverage`

### Refactoring a Script

1. **Write tests first** - Ensure current behavior is captured
2. **Make small changes** - One refactor at a time
3. **Keep tests passing** - Green → refactor → green
4. **Don't split files** - Remember single-file constraint
5. **Maintain exports** - Keep helper functions exported for tests

### Debugging a Test Failure

1. **Read the error message** - What assertion failed?
2. **Check the test helper** - Understand what it's testing
3. **Add console.logs** - In test code (not production code)
4. **Use test:ui** - Interactive UI for debugging
5. **Check mock setup** - Ensure mocks match expected behavior

### Adding a New Test Helper

1. **Identify the pattern** - Markdown-first or UI workflow?
2. **Create helper file** - In `tests/helpers/`
3. **Use factory pattern** - Accept config objects, return results
4. **Add JSDoc comments** - Document parameters and return values
5. **Export helper** - `module.exports = { helperFunction };`
6. **Use in tests** - Import and use in integration tests

---

## Important: What NOT to Do

### ❌ Never Suggest These

1. **Splitting scripts into multiple files**
   - Single-file constraint is absolute
   - `require()` between scripts is broken

2. **Using ES6 imports/exports**
   - Scripts run via `window.eval()`
   - CommonJS only

3. **Creating "shared utilities" folder in scripts/**
   - Cannot import between scripts
   - Helpers must be duplicated if needed in multiple scripts

4. **Complex build processes**
   - Keep it simple - no bundlers, no transpilers
   - Tests run in Node.js, scripts run in Obsidian

5. **Creating unnecessary documentation files**
   - Don't proactively create .md files
   - Prefer clear code over extensive docs

### ⚠️ Approach with Caution

1. **Suggesting architectural changes**
   - Read WORKFLOW.md first to understand "why"
   - Don't suggest changes that violate core principles

2. **Adding new dependencies**
   - Production code has ZERO dependencies
   - Only add devDependencies if truly necessary

3. **Changing test patterns**
   - Current patterns are well-tested
   - Only change if you have strong justification

---

## Key Scripts Deep Dive

### extractLog.js (~520 lines)

**Purpose:** Extract nested bullet content from daily notes to project/area notes.

**Key Features:**
- Handles wikilinks: `[[Target Note]]`, `[[Target Note|alias]]`, `[[Target Note#section]]`
- "Pure link bullets" inherit context from parent items
- Automatically manages "## Log" sections in target notes
- Preserves list hierarchy and checkbox states
- Copies extracted content to clipboard
- Creates section anchors for linking back

**Main Function:** `extractLog(tp)` - Entry point called from template

**Helper Functions (exported for testing):**
- `parseWikilink(text)` - Parse wikilink syntax
- `findPureLinks(lines)` - Find bullets that are just wikilinks
- `buildExtraction(parent, children)` - Build extraction content
- `insertIntoLogSection(content, extraction)` - Insert at start of ## Log
- Many more... (see unit tests for complete list)

**Usage in Templater:**
```
<% tp.user.extractLog.extractLog(tp) %>
```

**Testing:**
- Unit tests: `tests/unit/extractLog.test.js` (~470 lines)
- Integration tests: `tests/integration/extractLog.integration.test.js` (~235 lines)
- Uses markdown-first testing pattern

### migrateTask.js (~370 lines)

**Purpose:** BuJo-style task migration between periodic notes.

**Key Features:**
- Migrates incomplete tasks (`- [ ]`) and started tasks (`- [/]`) to next note
- Determines target based on note type and boundaries:
  - Daily (Mon-Sat) → next daily
  - Daily (Sunday) → next weekly
  - Weekly → next weekly
  - Monthly (Jan-Nov) → next monthly
  - Monthly (December) → next yearly
  - Yearly → next yearly
- Multi-select support: migrate all top-level tasks in selection
- Marks source as `- [>]`, target gets `- [ ]`
- Preserves task children with proper indentation

**Main Function:** `migrateTask(tp)` - Entry point called from template

**Helper Functions (exported for testing):**
- `parseNoteType(basename)` - Parse periodic note filename
- `getNextNotePath(noteInfo)` - Calculate target note path
- `isIncompleteTask(line)` - Check if line is incomplete task
- `findTopLevelTasksInRange(editor, listItems, start, end)` - Find tasks in selection
- `findChildrenLines(editor, listItems, line)` - Find children of a task
- `insertUnderLogHeading(content, extraction)` - Insert under ## Log heading

**Usage in Templater:**
```
<% tp.user.migrateTask.migrateTask(tp) %>
```

**Testing:**
- Unit tests: `tests/unit/migrateTask.test.js` (~390 lines)
- Integration tests: `tests/integration/migrateTask.integration.test.js` (~280 lines)
- Uses markdown-first testing pattern

### handleNewNote.js (~58 lines)

**Purpose:** Prompt for destination folder when creating new notes.

**Key Features:**
- Lists all folders (excluding hidden, journal, archive)
- Displays folder picker via `tp.system.suggester()`
- Deletes original note, creates in chosen location
- Opens the newly created note

**Main Function:** `handleNewNote(tp)` - Entry point called from template

**No helper functions** - Simple linear workflow

**Usage in Templater:**
```
<% tp.user.handleNewNote(tp) %>
```

**Testing:**
- Integration tests: `tests/integration/handleNewNote.integration.test.js` (122 lines)
- Uses UI workflow testing pattern

---

## Development Workflow (TDD)

### Recommended Process

1. **Write the test first** - Define expected behavior
   ```javascript
   describe('helperFunction', () => {
     it('should handle edge case X', () => {
       const result = helperFunction(input);
       expect(result).toBe(expected);
     });
   });
   ```

2. **Run the test** - It should fail (red)
   ```bash
   npm run test:watch
   ```

3. **Write/refactor code** - Make the test pass (green)
   ```javascript
   function helperFunction(input) {
     // Implementation
   }
   ```

4. **Refactor** - Clean up while keeping tests passing
   - Extract duplicated logic
   - Improve variable names
   - Add comments for complex sections

5. **Commit** - Small, focused commits
   ```bash
   git add .
   git commit -m "Add unit tests for helperFunction (TDD)"
   ```

### Recent Development Example

PR #4 shows exemplary TDD workflow:
- Started with unit tests for each helper function
- Built mock factories for Obsidian APIs
- Created integration tests with markdown-first approach
- Refactored to UI workflow pattern for handleNewNote
- Documented testing strategy and constraints

Each commit was focused on a single helper or concept, making the history easy to follow.

---

## Obsidian Plugin Ecosystem

### Key Plugins Used

**Templater** - Enables user scripts in Obsidian
- Provides `tp` object with file, system, config APIs
- Scripts run via `window.eval()` in Obsidian context
- [Templater Documentation](https://silentvoid13.github.io/Templater/)

**Periodic Notes** - Auto-generates daily/weekly/monthly/yearly notes
- Creates notes based on templates
- Used for daily note workflow

**Minimal Theme** - Semantic bullets and visual markers
- Custom checkbox styling
- Visual hierarchy without extra effort

**Calendar Plugin** - Navigation for period notes
- Highlights notes with unhandled tasks
- Supports workflow's migration pattern

**Dataview** - Queries and summaries
- Dynamic embeds (e.g., MIT list in daily note)
- Query language for note metadata

### Why Not a "Real" Plugin?

**User scripts via Templater are sufficient** because:
1. Scripts execute in Obsidian context with full API access
2. No plugin packaging, approval, or distribution needed
3. Immediate testing and iteration
4. Simple to maintain and version control
5. Works on mobile (via Templater mobile support)

**Limitations accepted:**
- Single-file constraint
- CommonJS only (no ES6 import/export syntax)
- Manual execution via templates (not automatic hooks)

These limitations are manageable and documented. The benefits of simplicity outweigh the constraints.

---

## References

### Documentation

- [WORKFLOW.md](WORKFLOW.md) - Complete workflow philosophy and principles
- [TESTING.md](TESTING.md) - Testing strategy, constraints, and patterns
- [README.md](README.md) - Project overview and quick start

### External Resources

- [Templater User Scripts Documentation](https://silentvoid13.github.io/Templater/user-functions/script-user-functions.html) - Shows ES6+ examples in official docs
- [Templater Issue #539 - Import limitations](https://github.com/SilentVoid13/Templater/issues/539)
- [Templater TypeScript Discussion #765](https://github.com/SilentVoid13/Templater/discussions/765)
- [Obsidian API Documentation](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Obsidian Electron Changelog](https://fevol.github.io/obsidian-typings/resources/electron-changelog/) - Tracks Electron version (34+)

### Code Examples

- See `tests/integration/` for complete working examples
- See `tests/helpers/` for test helper patterns
- See `tests/mocks/` for mock factory patterns

---

## Summary: AI Assistant Checklist

When working on this codebase, remember:

✅ **Always:**
- Use CommonJS (`module.exports`, `require()`)
- Use modern JavaScript (ES6+): `const`, `let`, arrow functions, template literals
- Keep scripts in single files
- Export helpers for testing
- Write tests first (TDD)
- Read WORKFLOW.md to understand "why"
- Use appropriate test pattern (markdown-first or UI workflow)
- Mock Obsidian global APIs in tests
- Target 75%+ coverage

❌ **Never:**
- Use ES6 import/export syntax
- Split scripts into multiple files in `scripts/`
- Try to `require()` other user scripts
- Suggest complex build processes
- Create unnecessary documentation
- Test Obsidian internals (trust the framework)

⚠️ **When in doubt:**
- Check existing test patterns
- Read TESTING.md for constraints
- Ask before making architectural changes
- Keep it simple - this system values simplicity over sophistication

---

**Last Updated:** 2026-01-23

**Repository:** [nfelger/obsidian-tools](https://github.com/nfelger/obsidian-tools)
