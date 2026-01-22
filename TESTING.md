# Testing Guide

This document describes the testing strategy and constraints for Obsidian Templater user scripts.

## Templater User Script Constraints

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

Export an object containing the main function and all testable helpers:

```javascript
function helperA() { /* ... */ }
function helperB() { /* ... */ }

async function mainFunction(tp) {
  // Use helpers
}

module.exports = {
  mainFunction,
  helperA,
  helperB
};
```

**Usage in template:** `<% tp.user.scriptName.mainFunction(tp) %>`

**In tests:** Import with destructuring for clean syntax:
```javascript
const { helperA, helperB } = require('../../scripts/scriptName.js');
```

### Global Variables

Scripts have access to Obsidian globals:
- `app` - Obsidian app object (vault, workspace, metadataCache, etc.)
- `moment` - Moment.js library
- `Notice` - Obsidian notification API

The `tp` (Templater) object must be passed as a function parameter.

### TypeScript Support

TypeScript is **supported** but requires compilation:
1. Write scripts in TypeScript (`.ts` files)
2. Compile with `tsc` to JavaScript
3. Output `.js` files to the `scripts/` folder
4. Community type definitions available: [templater-scripts-types](https://github.com/TheRealWolfick/templater-scripts-types)

**Current approach:** Stick to JavaScript for simplicity.

## Testing Strategy

### Tech Stack

- **Test Framework:** Vitest
- **Mocking:** Vitest's built-in `vi` mocking utilities
- **Coverage:** `@vitest/coverage-v8`

### Test Structure

```
tests/
├── unit/                      # Pure function tests
│   ├── extractLog.test.js
│   └── handleNewNote.test.js
├── integration/               # Full flow tests with mocks
│   └── extractLog.integration.test.js
├── helpers/                   # Test utilities
│   ├── markdownParser.js      # Parse markdown → Obsidian metadata
│   └── extractLogTestHelper.js # Markdown-first test builder
├── mocks/                     # Mock factories
│   └── obsidian.js            # Mock app, vault, editor, tp
└── vitest.setup.js            # Global test setup
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

### Example: Testing a Helper Function

```javascript
// tests/unit/extractLog.test.js
import { describe, it, expect } from 'vitest';

const { countIndent } = require('../../scripts/extractLog.js');

describe('countIndent', () => {
  it('counts spaces correctly', () => {
    expect(countIndent('    hello')).toBe(4);
  });

  it('counts tabs correctly', () => {
    expect(countIndent('\t\thello')).toBe(2);
  });

  it('returns 0 for no indent', () => {
    expect(countIndent('hello')).toBe(0);
  });
});
```

### Example: Integration Testing with Markdown-First Approach

Integration tests use a **markdown-first** approach that makes tests readable and focused on user-visible transformations:

```javascript
// tests/integration/extractLog.integration.test.js
import { testExtractLog } from '../helpers/extractLogTestHelper.js';

it('extracts children to target note with wikilink', async () => {
  const result = await testExtractLog({
    source: `
- [[Target Note]]
  - Child 1
  - Child 2
    `,
    targetNotes: {
      'Target Note': `
## Log
      `
    }
  });

  expect(result.source).toBe('- [[Target Note#daily|Target Note]]');

  expect(result.target('Target Note')).toBe(`
## Log

### [[daily]]

- Child 1
- Child 2
  `.trim());
});
```

**Key features of this approach:**
- **Input as markdown strings** - Easy to read and write test cases
- **Automatic metadata generation** - Parser converts markdown to Obsidian's internal structures
- **State tracking** - Helper tracks modifications to source and target notes
- **Clean assertions** - Test the markdown output, not the mock API calls

**Behind the scenes:**
1. `markdownParser.js` converts markdown → Obsidian listItems metadata
2. `extractLogTestHelper.js` sets up mocks with state tracking
3. Script executes against realistic mock environment
4. Helper returns final markdown state for assertions

### When to Use Which Test Type

**Use Unit Tests when:**
- Testing pure functions (no side effects)
- Function logic is complex and needs edge case coverage
- Fast feedback is important (unit tests run instantly)
- Examples: `countIndent()`, `dedentLines()`, `isDescendantOf()`

**Use Integration Tests when:**
- Testing the main workflow end-to-end
- Validating markdown transformations
- Ensuring multiple components work together
- Examples: Full `extractLog()` flow, note creation workflows

**Don't test:**
- Obsidian internals (trust the framework)
- Third-party libraries (trust their tests)
- Simple getters/setters with no logic

### Coverage Goals

Current test coverage achievements:

```
File                  | % Stmts | % Branch | % Funcs | % Lines
----------------------|---------|----------|---------|--------
All files             |   92.54 |    92.48 |     100 |   92.54
 extractLog.js        |   91.66 |    91.30 |     100 |   91.66
 handleNewNote.js     |     100 |      100 |     100 |     100
```

**Target coverage:**
- **Functions:** 100% (all functions should be tested)
- **Branches:** 90%+ (most code paths covered)
- **Statements:** 85%+ (reasonable coverage without over-testing)

**Philosophy:** Focus on testing behavior that matters to users, not achieving 100% coverage for its own sake.

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
