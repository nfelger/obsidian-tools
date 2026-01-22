# CLAUDE.md - AI Assistant Guide

This document provides comprehensive guidance for AI assistants working on the obsidian-tools codebase. Read this first to understand the system's philosophy, technical constraints, and development conventions.

## Quick Start

**What This Is:** A collection of Templater user scripts for Obsidian that support a BuJo-inspired (Bullet Journal) knowledge management workflow. This is NOT a traditional Obsidian plugin - scripts run via the Templater plugin and have unique constraints.

**Key Scripts:**
- `scripts/extractLog.js` (~520 LOC) - Extracts nested content from daily notes to project/area notes
- `scripts/handleNewNote.js` (~58 LOC) - Prompts for folder selection when creating new notes

**Essential Reading:**
1. This file (CLAUDE.md) - Technical constraints and conventions
2. [WORKFLOW.md](WORKFLOW.md) - Philosophy and "why" behind design decisions
3. [TESTING.md](TESTING.md) - Testing strategy and constraints

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
├── scripts/                   # Templater user scripts (production code)
│   ├── extractLog.js         # Main script: log extraction workflow
│   └── handleNewNote.js      # UI script: folder picker for new notes
│
├── snippets/                  # CSS customizations
│   └── custom-checkboxes.css # Visual checkbox markers
│
├── tests/                     # Comprehensive test suite
│   ├── unit/                 # Pure function tests (95%+ coverage goal)
│   │   └── extractLog.test.js
│   ├── integration/          # Full workflow tests (60-80% coverage)
│   │   ├── extractLog.integration.test.js
│   │   └── handleNewNote.integration.test.js
│   ├── helpers/              # Test utilities
│   │   ├── extractLogTestHelper.js      # Markdown-first pattern
│   │   ├── handleNewNoteTestHelper.js   # UI workflow pattern
│   │   └── markdownParser.js            # Parse markdown → listItems
│   └── mocks/                # Obsidian API mocks
│       └── obsidian.js       # Factory functions for all mocks
│
├── WORKFLOW.md               # Workflow philosophy (196 lines) - READ THIS
├── TESTING.md                # Testing strategy and constraints
├── README.md                 # Project overview
├── package.json              # NPM configuration (CommonJS, no deps)
├── vitest.config.js         # Test framework configuration
└── .gitignore               # Version control exclusions
```

### File Size Context

- **Total scripts:** ~17KB (2 files)
- **Total tests:** ~1,892 LOC
- **extractLog.js:** ~520 lines (complex markdown manipulation)
- **handleNewNote.js:** ~58 lines (simple UI workflow)

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
- Runs inside **Obsidian** (Electron app) via **Templater plugin**
- Scripts executed via `window.eval()` in Obsidian context
- Has access to Obsidian global APIs: `app`, `moment`, `Notice`
- `tp` (Templater) object passed as function parameter

**Key Obsidian APIs Used:**
- `app.vault` - File operations (create, delete, read, modify)
- `app.workspace` - Navigate to files, get active leaf
- `app.metadataCache` - Access list item metadata (line numbers, children, parent)
- `navigator.clipboard` - Copy extracted content

**No Node.js APIs** - Scripts run in browser context, not Node.js.

### Tech Stack

**Production:**
- JavaScript (ES5-compatible, CommonJS modules only)
- Obsidian API (vault, workspace, metadataCache)
- Templater API (tp.system.suggester, tp.file, tp.config)

**Development:**
- Node.js (development environment only)
- Vitest (test framework with built-in mocking)
- @vitest/ui (interactive test UI)
- @vitest/coverage-v8 (code coverage)

### Module System

**Critical: CommonJS Only**
```javascript
// ✅ CORRECT - Use this pattern
module.exports = {
  mainFunction,
  helperA,
  helperB
};

// ❌ WRONG - ES6 imports/exports don't work
export function mainFunction() { }
import { helper } from './other.js';
```

**Why:** Scripts are executed via `window.eval()`, which doesn't support ES6 module syntax.

---

## Critical Constraints

### 1. Single-File Constraint

**Each script MUST be self-contained in a single file.**

```javascript
// ❌ WRONG - Cannot import other user scripts
const { helper } = require('./otherScript.js');  // BROKEN in Templater v1.10.0+

// ✅ CORRECT - All helpers in same file
function helper() { /* ... */ }
function mainFunction(tp) {
  helper();  // Works because it's in same file
}
```

**Why:** Templater's `require()` for importing other user scripts is broken. See [Templater Issue #539](https://github.com/SilentVoid13/Templater/issues/539).

**Implication:** When suggesting changes, NEVER propose splitting a script into multiple files in `scripts/` directory. Helper functions must live alongside the main function.

### 2. CommonJS Export Pattern

```javascript
// Required structure for testability
function helperA() { /* ... */ }
function helperB() { /* ... */ }

async function mainFunction(tp) {
  // Use helpers
}

// Export everything - main function AND helpers
module.exports = {
  mainFunction,
  helperA,
  helperB
};
```

**Usage in Templater:** `<% tp.user.scriptName.mainFunction(tp) %>`

**Usage in tests:**
```javascript
const { helperA, helperB } = require('../../scripts/scriptName.js');
```

### 3. ES5 Compatibility

Production code in `scripts/` should be ES5-compatible:
```javascript
// ✅ CORRECT
var items = array.filter(function(item) {
  return item.value > 0;
});

// ⚠️ AVOID in production (though may work)
const items = array.filter(item => item.value > 0);
```

**Test code can use modern JavaScript** - tests run in Node.js, not Obsidian's eval context.

### 4. Global Variables

Scripts have access to:
- `app` - Obsidian app object (auto-injected)
- `moment` - Moment.js library (auto-injected)
- `Notice` - Obsidian notification API (auto-injected)
- `tp` - Templater object (must be passed as parameter)

```javascript
// ✅ CORRECT - Use globals directly
function mainFunction(tp) {
  const folders = app.vault.getAllFolders();  // app is global
  new Notice('Done!');                        // Notice is global
}

// ❌ WRONG - Don't expect to import them
import { app } from 'obsidian';  // Doesn't work
```

---

## Development Conventions

### Code Style

**Production Scripts:**
- ES5-compatible JavaScript
- Use `var` and `function` declarations
- Avoid arrow functions in production code
- Comprehensive inline comments explaining complex logic
- Single-file constraint: all helpers in same file

**Test Code:**
- Modern JavaScript (ES6+) is fine
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
│   └── extractLog.test.js         # 470 lines, thorough edge cases
│
├── integration/                    # Full workflow tests
│   ├── extractLog.integration.test.js      # 235 lines
│   └── handleNewNote.integration.test.js   # 122 lines
│
├── helpers/                        # Test utilities
│   ├── extractLogTestHelper.js            # Markdown-first pattern
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

module.exports = {
  mainFunction,
  helper
};
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
- Unit tests: `tests/unit/extractLog.test.js` (470 lines)
- Integration tests: `tests/integration/extractLog.integration.test.js` (235 lines)
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
- CommonJS only
- No ES6 imports
- Manual execution via templates (not automatic hooks)

These limitations are manageable and documented. The benefits of simplicity outweigh the constraints.

---

## References

### Documentation

- [WORKFLOW.md](WORKFLOW.md) - Complete workflow philosophy and principles
- [TESTING.md](TESTING.md) - Testing strategy, constraints, and patterns
- [README.md](README.md) - Project overview and quick start

### External Resources

- [Templater User Scripts Documentation](https://silentvoid13.github.io/Templater/user-functions/script-user-functions.html)
- [Templater Issue #539 - Import limitations](https://github.com/SilentVoid13/Templater/issues/539)
- [Templater TypeScript Discussion #765](https://github.com/SilentVoid13/Templater/discussions/765)
- [Obsidian API Documentation](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

### Code Examples

- See `tests/integration/` for complete working examples
- See `tests/helpers/` for test helper patterns
- See `tests/mocks/` for mock factory patterns

---

## Summary: AI Assistant Checklist

When working on this codebase, remember:

✅ **Always:**
- Use CommonJS (`module.exports`)
- Keep scripts in single files
- Export helpers for testing
- Write tests first (TDD)
- Read WORKFLOW.md to understand "why"
- Use appropriate test pattern (markdown-first or UI workflow)
- Mock Obsidian global APIs in tests
- Target 75%+ coverage

❌ **Never:**
- Use ES6 imports/exports
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

**Last Updated:** 2026-01-22

**Repository:** [nfelger/obsidian-tools](https://github.com/nfelger/obsidian-tools)

**Branch:** `claude/claude-md-mkpnp3kmauzr6vhn-6v1tY`
