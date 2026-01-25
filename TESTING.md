# Testing Guide

This document describes the testing strategy for the Bullet Flow Obsidian plugin.

## Overview

The test suite covers all plugin functionality using Vitest with comprehensive Obsidian API mocks.

**Test Organization:**
- **Unit Tests** — Pure function tests in `tests/unit/`
- **Integration Tests** — Full command workflows in `tests/integration/`
- **Test Helpers** — Reusable test utilities in `tests/helpers/`
- **Mocks** — Obsidian API mocks in `tests/mocks/`

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

**Key Insight:** Use multi-line template strings for markdown test cases - they're much easier to read than concatenated strings:

```typescript
import { testExtractLogPlugin } from '../helpers/extractLogPluginTestHelper';

it('should extract bullet to target note', async () => {
  // ✅ GOOD - Multi-line template strings are readable
  const result = await testExtractLogPlugin({
    source: `
- Extract this [[Target]]
  - Child content
  - More details
`,
    sourceFileName: '2026-01-25 Sat',
    targetNoteName: 'Target',
    targetContent: `
## Existing Section

Some content
`,
    cursorLine: 0
  });

  expect(result.target).toContain('## Log');
  expect(result.target).toContain('Child content');
});

// ❌ BAD - Concatenated strings are hard to read
// source: '- Extract this [[Target]]\n  - Child content\n  - More details\n'
```

**Benefits of template strings:**
- Natural indentation matches markdown structure
- Easy to see the actual content being tested
- Clear whitespace handling
- Tests read like user stories

## Legacy Scripts

The `scripts/` folder contains `handleNewNote.js`, a Templater user script that is not yet part of the plugin. It has its own test suite using JavaScript and CommonJS patterns.

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

**Unit Tests: Test Pure Functions**
- Focus on pure functions (no side effects)
- Test with simple inputs/outputs
- Cover edge cases thoroughly

**Integration Tests: Test Command Workflows**
- Use markdown-first approach with template strings for readable tests
- Test user-visible transformations, not implementation details
- Mock Obsidian APIs (`app`, `vault`, `editor`)
- Test full workflows with realistic scenarios

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

When adding tests to existing code:

1. **Identify pure functions** - Functions with no side effects
2. **Extract if needed** - Separate pure logic from Obsidian API calls
3. **Write tests** - Cover edge cases and typical usage
4. **Verify in Obsidian** - Ensure plugin still works

### Key Principles

✅ **DO:**
- Use TypeScript with ES6 modules
- Mock Obsidian global APIs in tests
- Test pure functions thoroughly
- Write small, focused tests
- Use multi-line template strings for markdown test cases
- Commit often

❌ **DON'T:**
- Test Obsidian internals (trust the framework)
- Include test counts or coverage stats in documentation

## References

- [Vitest Documentation](https://vitest.dev/)
- [Obsidian API Documentation](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
