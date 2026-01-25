# Testing Guide

This document describes the testing strategy for the Bullet Flow Obsidian plugin.

## Overview

The test suite includes **291 tests** covering both plugin implementation (TypeScript) and legacy Templater scripts (JavaScript). Tests use Vitest with comprehensive Obsidian API mocks.

**Test Organization:**
- **Plugin Tests** — TypeScript tests for `src/` (commands and utilities)
- **Legacy Tests** — JavaScript tests for `scripts/` (reference implementation)

## Plugin Testing (TypeScript)

### Module System

**ES6 Modules**
- Plugin code uses TypeScript with ES6 `import`/`export`
- Compiled to JavaScript via esbuild
- Bundled into single `main.js` for distribution

**Example:**
```typescript
// src/utils/wikilinks.ts
import { TFile } from 'obsidian';

export function parseWikilink(text: string): WikiLink | null {
  // Implementation
}

// src/commands/extractLog.ts
import { MarkdownView, Notice } from 'obsidian';
import { parseWikilink } from '../utils/wikilinks';
import type BulletFlowPlugin from '../main';

export async function extractLog(plugin: BulletFlowPlugin) {
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  // Implementation
}
```

### Test Structure for Plugin

**Unit Tests** (`.test.ts` files):
- Test pure utility functions in `src/utils/`
- TypeScript with type safety
- Mock-free where possible
- Examples: `indent.test.ts`, `wikilinks.test.ts`, `periodicNotes.test.ts`, `tasks.test.ts`

**Integration Tests** (`.plugin.test.ts` files):
- Test full command workflows
- Use test helpers (`extractLogPluginTestHelper.ts`, `migrateTaskPluginTestHelper.ts`)
- Mock Obsidian APIs via factory functions
- Markdown-first pattern: input markdown → output markdown
- Examples: `extractLog.plugin.test.ts`, `migrateTask.plugin.test.ts`

### Plugin Test Pattern

```typescript
import { describe, it, expect } from 'vitest';
import { parseWikilink } from '../../src/utils/wikilinks';

describe('parseWikilink', () => {
  it('parses basic wikilink', () => {
    const result = parseWikilink('[[Note]]');
    expect(result).toEqual({
      link: 'Note',
      display: null,
      section: null
    });
  });
});
```

**Integration test with helper:**
```typescript
import { testExtractLogPlugin } from '../helpers/extractLogPluginTestHelper';

it('should extract bullet to target note', async () => {
  const result = await testExtractLogPlugin({
    source: '- Extract this [[Target]]\n  - Child content',
    sourceFileName: '2026-01-25 Sat',
    targetNoteName: 'Target',
    targetContent: '',
    cursorLine: 0
  });

  expect(result.target).toContain('## Log');
  expect(result.target).toContain('Child content');
});
```

## Legacy Testing (JavaScript - Templater Scripts)

The `scripts/` folder contains the original Templater implementation, kept as reference during migration. These scripts have their own test suite using the same infrastructure.

### Templater User Script Constraints

### Module System

**CommonJS Only**
- Templater user scripts use **CommonJS** (`module.exports`) exclusively
- Scripts are executed via `window.eval()` in the Obsidian context
- **No ES6 imports/exports** - these will not work

**Single-File Constraint**
- Each script **must be self-contained in a single file**
- `require()` for importing other user scripts is **broken** in Templater v1.10.0+
- All helper functions must live in the same file as the main function

### Export Pattern

Export the main function directly, with helpers attached as properties:

```javascript
function helperA() { /* ... */ }
function helperB() { /* ... */ }

async function mainFunction(tp) {
  // Use helpers
}

// Export main function directly for Templater compatibility
// Attach helpers as properties for testing
module.exports = mainFunction;
module.exports.mainFunction = mainFunction;
module.exports.helperA = helperA;
module.exports.helperB = helperB;
```

**Why this pattern:** Templater validates that user script exports are callable functions. Exporting an object causes "Default export is not a function" errors.

**Usage in template:** `<% tp.user.scriptName(tp) %>` or `<% tp.user.scriptName.mainFunction(tp) %>`

**In tests:** Import with destructuring for clean syntax:
```javascript
const { mainFunction, helperA, helperB } = require('../../scripts/scriptName.js');
```

### Global Variables

Scripts have access to Obsidian globals:
- `app` - Obsidian app object (vault, workspace, metadataCache, etc.)
- `moment` - Moment.js library
- `Notice` - Obsidian notification API

The `tp` (Templater) object must be passed as a function parameter.

## Testing Strategy

### Tech Stack

- **Test Framework:** Vitest
- **Mocking:** Vitest's built-in `vi` mocking utilities
- **Coverage:** `@vitest/coverage-v8`

### Test Structure

```
tests/
├── unit/                               # Pure function tests
│   ├── *.test.ts                      # Plugin utilities (TypeScript)
│   └── *.test.js                      # Legacy scripts (JavaScript)
├── integration/                        # Full workflow tests
│   ├── *.plugin.test.ts               # Plugin commands (TypeScript)
│   └── *.integration.test.js          # Legacy scripts (JavaScript)
├── helpers/                            # Test utilities
│   ├── *PluginTestHelper.ts           # Plugin test helpers
│   └── *TestHelper.js                 # Legacy test helpers
├── mocks/
│   └── obsidian.js                    # Obsidian API mock factories
└── vitest.setup.js
```

### Testing Approach

**Unit Tests: Test Exported Helpers**
- Focus on pure functions (no side effects)
- Test with simple inputs/outputs
- Aim for 95%+ coverage on helpers

**Integration Tests: Test Main Functions**
- Use markdown-first approach for readable tests
- Test user-visible transformations, not implementation details
- Mock Obsidian APIs (`app`, `vault`, `editor`)
- Mock Templater `tp` object
- Test full workflows with realistic scenarios
- Aim for 60-80% coverage (harder to test orchestration)

### Test Patterns

**Unit Tests** test pure helper functions with simple inputs and outputs. See `tests/unit/` for examples.

**Integration Tests** use test helpers to hide mock complexity and focus on user-visible behavior:

- **Markdown-first pattern**: For scripts that transform markdown content. Test helpers accept markdown strings as input and return transformed markdown as output. State tracking captures all modifications during execution.

- **UI workflow pattern**: For scripts that orchestrate file operations and UI interactions. Test helpers accept configuration objects (folders, user choices) and return structured results (what was displayed, created, opened, etc.).

See the actual test files in `tests/integration/` and their corresponding helpers in `tests/helpers/` for implementation details.

### When to Use Which Test Type

**Use Unit Tests when:**
- Testing pure functions (no side effects)
- Function logic is complex and needs edge case coverage
- Fast feedback is important (unit tests run instantly)

**Use Integration Tests when:**
- Testing the main workflow end-to-end
- Validating markdown transformations
- Ensuring multiple components work together

**Don't test:**
- Obsidian internals (trust the framework)
- Third-party libraries (trust their tests)
- Simple getters/setters with no logic

Coverage targets are configured in `vitest.config.js`.

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# UI mode
npm run test:ui
```

## Development Workflow

### Test-Driven Development (TDD)

1. **Write the test first** - Define expected behavior
2. **Run the test** - It should fail (red)
3. **Write/refactor code** - Make the test pass (green)
4. **Refactor** - Clean up while keeping tests passing
5. **Commit** - Small, focused commits

### Refactoring for Testability

When adding tests to existing scripts:

1. **Identify pure functions** - Functions with no side effects
2. **Extract if needed** - Separate pure logic from Obsidian API calls
3. **Export helpers** - Add to `module.exports.helperName = helperName`
4. **Write tests** - Cover edge cases and typical usage
5. **Verify in Obsidian** - Ensure script still works in Templater

### Key Principles

✅ **DO:**
- Keep everything in single files
- Export helpers as properties of `module.exports`
- Mock Obsidian global APIs in tests
- Test pure functions thoroughly
- Write small, focused tests
- Commit often

❌ **DON'T:**
- Try to use `require()` to import other user scripts
- Split script logic into multiple files in `scripts/` folder
- Assume Node.js module resolution works normally
- Test Obsidian internals (trust the framework)

## References

- [Templater User Scripts Documentation](https://silentvoid13.github.io/Templater/user-functions/script-user-functions.html)
- [Templater Issue #539 - Import limitations](https://github.com/SilentVoid13/Templater/issues/539)
- [Templater TypeScript Discussion #765](https://github.com/SilentVoid13/Templater/discussions/765)
