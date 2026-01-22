import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testExtractLog } from '../helpers/extractLogTestHelper.js';
import {
  createMockApp,
  createMockWorkspace,
  createMockTp,
  createMockNotice
} from '../mocks/obsidian.js';

const { extractLog } = require('../../scripts/extractLog.js');

describe('extractLog - markdown transformations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('shows message when no children under current bullet', async () => {
    const result = await testExtractLog({
      source: `
- Parent item
- Sibling item
      `
    });

    expect(result.notice).toContain('No children');
    expect(result.source).toBe(`
- Parent item
- Sibling item
    `.trim());
  });

  it('handles pure link bullets with parent context', async () => {
    const result = await testExtractLog({
      source: `
- Project work
  - [[Target Note]]
    - Task 1
    - Task 2
      `,
      cursorLine: 1,
      targetNotes: {
        'Target Note': `
## Log
        `
      }
    });

    expect(result.source).toBe(`
- Project work
  - [[Target Note#daily Project work|Target Note]]
    `.trim());

    expect(result.target('Target Note')).toBe(`
## Log

### [[daily]] Project work

- Task 1
- Task 2
    `.trim());
  });

  it('creates Log section if missing in target', async () => {
    const result = await testExtractLog({
      source: `
- [[Target Note]]
  - Content
      `,
      targetNotes: {
        'Target Note': `
# Target Note

Some existing content
        `
      }
    });

    expect(result.target('Target Note')).toContain('## Log');
    expect(result.target('Target Note')).toContain('### [[daily]]');
    expect(result.target('Target Note')).toContain('- Content');
  });

  it('handles nested list structures', async () => {
    const result = await testExtractLog({
      source: `
- [[Target Note]]
  - Level 1
    - Level 2
      - Level 3
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

- Level 1
  - Level 2
    - Level 3
    `.trim());
  });

  it('handles checkboxes in list items', async () => {
    const result = await testExtractLog({
      source: `
- [[Target Note]]
  - [ ] Unchecked task
  - [x] Completed task
  - [>] Custom marker
      `,
      targetNotes: {
        'Target Note': `
## Log
        `
      }
    });

    const targetContent = result.target('Target Note');
    expect(targetContent).toContain('- [ ] Unchecked task');
    expect(targetContent).toContain('- [x] Completed task');
    expect(targetContent).toContain('- [>] Custom marker');
  });

  it('updates wikilink with section anchor', async () => {
    const result = await testExtractLog({
      source: `
- [[Target Note]] some context
  - Child
      `,
      targetNotes: {
        'Target Note': `
## Log
        `
      }
    });

    // The wikilink should be updated to point to the created section
    expect(result.source).toContain('[[Target Note#');
    expect(result.source).toContain('daily');
  });
});

describe('extractLog - error cases', () => {
  let mockNotice;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNotice = createMockNotice();
    vi.stubGlobal('Notice', mockNotice);
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } });
  });

  it('shows error when no active markdown view', async () => {
    const mockWorkspace = createMockWorkspace();
    mockWorkspace.activeLeaf = null;

    const mockApp = createMockApp({ workspace: mockWorkspace });
    vi.stubGlobal('app', mockApp);

    const mockTp = createMockTp({ app: mockApp });

    await extractLog(mockTp);

    expect(mockNotice).toHaveBeenCalledWith(
      expect.stringContaining('No active markdown view'),
      expect.any(Number)
    );
  });

  it('shows error when no active file', async () => {
    const mockWorkspace = createMockWorkspace({ editor: null, file: null });
    mockWorkspace.activeLeaf.view.file = null;

    const mockApp = createMockApp({ workspace: mockWorkspace });
    vi.stubGlobal('app', mockApp);

    const mockTp = createMockTp({ app: mockApp });

    await extractLog(mockTp);

    expect(mockNotice).toHaveBeenCalledWith(
      expect.stringContaining('No active file'),
      expect.any(Number)
    );
  });

  it('handles errors gracefully', async () => {
    const mockApp = createMockApp();
    mockApp.workspace = null;
    vi.stubGlobal('app', mockApp);

    const mockTp = createMockTp({ app: mockApp });

    await extractLog(mockTp);

    expect(mockNotice).toHaveBeenCalledWith(
      expect.stringContaining('ERROR'),
      8000
    );
  });
});
