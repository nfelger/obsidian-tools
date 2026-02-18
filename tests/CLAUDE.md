# Testing Guide

## Commands

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode (TDD)
npm run test:coverage # Coverage report
npm run test:ui       # Interactive UI
```

## Pattern: Markdown-First

Use multi-line template strings for markdown test cases — never concatenated strings.
Tests should read like user stories, with clear input → output structure.

```typescript
// ✅ GOOD
const result = await testExtractLog({
  source: `
- Extract this [[Target Note]]
  - Child content
  - More details
`,
  targetNoteContent: `
## Existing Section

Some content
`
});

// ❌ BAD — hard to read, unclear whitespace
const result = await testExtractLog({
  source: '- Extract this [[Target Note]]\n  - Child content\n',
});
```

## Mock Factories (`tests/mocks/obsidian.js`)

- `createMockEditor(content)` — mock editor with content
- `createMockMetadataCache(file, listItems)` — mock metadata cache
- `createMockVault()` — mock vault with read/write operations
- `createMockApp()` — full mock app (vault + workspace + cache)

Global stubs needed in test setup:

```javascript
vi.stubGlobal('Notice', vi.fn());
navigator.clipboard.writeText = vi.fn();
```

## File Naming

- `tests/unit/*.test.ts` — pure function tests (TypeScript)
- `tests/integration/*.plugin.test.ts` — full command workflow tests (TypeScript)
- `tests/unit/*.test.js` / `tests/integration/*.integration.test.js` — legacy Templater
  script tests (JavaScript/CommonJS, separate from the plugin)

The `scripts/` folder contains `handleNewNote.js`, a legacy Templater user script not yet
part of the plugin. It has its own JS test suite with different patterns — don't apply
plugin test conventions there.

## Principles

- **Prefer input → output verification over mock interaction assertions.** Tests should
  read: given file content X, running command Y produces file content Z. Mock only what's
  necessary to make the command run — don't assert on `mock.calls` or spy sequences unless
  there's no file output to verify (e.g. `Notice`, workspace navigation).
- Unit tests for pure functions, integration tests for full command workflows
- Don't test Obsidian internals — trust the framework, mock at the boundary
- TDD: write the failing test first, then implement
- Never disable or skip tests to make CI pass — fix the underlying issue
