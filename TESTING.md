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

### Export Patterns

**Option 1: Main function with exported helpers (Recommended)**
```javascript
function helperA() { /* ... */ }
function helperB() { /* ... */ }

function mainFunction(tp) {
  // Use helpers
}

module.exports = mainFunction;
module.exports.helperA = helperA;
module.exports.helperB = helperB;
```

Usage in template: `<% tp.user.scriptName(tp) %>`

**Option 2: Object of functions**
```javascript
module.exports = {
  mainFunction: function(tp) { /* ... */ },
  helperA: function() { /* ... */ },
  helperB: function() { /* ... */ }
};
```

Usage in template: `<% tp.user.scriptName.mainFunction(tp) %>`

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
├── unit/              # Pure function tests
│   ├── extractLog.test.js
│   └── handleNewNote.test.js
├── integration/       # Full flow tests with mocks
│   └── extractLog.integration.test.js
├── mocks/             # Mock factories
│   ├── obsidian.js    # Mock app, vault, editor
│   └── templater.js   # Mock tp object
└── vitest.setup.js    # Global test setup
```

### Testing Approach

**Unit Tests: Test Exported Helpers**
- Focus on pure functions (no side effects)
- Test with simple inputs/outputs
- Aim for 95%+ coverage on helpers

**Integration Tests: Test Main Functions**
- Mock Obsidian APIs (`app`, `vault`, `editor`)
- Mock Templater `tp` object
- Test full workflows with realistic scenarios
- Aim for 60-80% coverage (harder to test orchestration)

### Example: Testing a Helper Function

```javascript
// tests/unit/extractLog.test.js
import { describe, it, expect } from 'vitest';

const extractLog = require('../../scripts/extractLog.js');

describe('countIndent', () => {
  it('counts spaces correctly', () => {
    expect(extractLog.countIndent('    hello')).toBe(4);
  });

  it('counts tabs correctly', () => {
    expect(extractLog.countIndent('\t\thello')).toBe(2);
  });

  it('returns 0 for no indent', () => {
    expect(extractLog.countIndent('hello')).toBe(0);
  });
});
```

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
