import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testExtractLogPlugin } from '../helpers/extractLogPluginTestHelper';

describe('extractLog (plugin) - markdown transformations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts children to target note with wikilink', async () => {
    const result = await testExtractLogPlugin({
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
    const result = await testExtractLogPlugin({
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
    const result = await testExtractLogPlugin({
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
    const result = await testExtractLogPlugin({
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
    const result = await testExtractLogPlugin({
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
    const result = await testExtractLogPlugin({
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
    const result = await testExtractLogPlugin({
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

  it('handles wikilinks with existing aliases', async () => {
    const result = await testExtractLogPlugin({
      source: `
- [[Target Note|My Alias]] extra text
  - Child content
      `,
      targetNotes: {
        'Target Note': `
## Log
        `
      }
    });

    // Should preserve the original alias
    expect(result.source).toContain('|My Alias]]');
    // But update the link target to include section
    expect(result.source).toContain('[[Target Note#');
  });

  it('handles non-pure link bullets with text after link', async () => {
    const result = await testExtractLogPlugin({
      source: `
- [[Target Note]] discussed feature X
  - Detail 1
  - Detail 2
      `,
      targetNotes: {
        'Target Note': `
## Log
        `
      }
    });

    // The heading suffix should be "discussed feature X"
    expect(result.target('Target Note')).toContain('### [[daily]] discussed feature X');
  });

  it('uses logExtractionTargetHeading, not periodicNoteTaskTargetHeading', async () => {
    const result = await testExtractLogPlugin({
      source: `
- [[Target Note]]
  - Child content
      `,
      targetNotes: {
        'Target Note': `
## Log
        `
      },
      settings: {
        periodicNoteTaskTargetHeading: '## Todo'
      }
    });

    expect(result.target('Target Note')).toContain('## Log');
    expect(result.target('Target Note')).toContain('- Child content');
    expect(result.target('Target Note')).not.toContain('## Todo');
  });

  it('respects custom logExtractionTargetHeading', async () => {
    const result = await testExtractLogPlugin({
      source: `
- [[Target Note]]
  - Child content
      `,
      targetNotes: {
        'Target Note': `
## Journal
        `
      },
      settings: {
        logExtractionTargetHeading: '## Journal'
      }
    });

    expect(result.target('Target Note')).toContain('## Journal');
    expect(result.target('Target Note')).toContain('### [[daily]]');
    expect(result.target('Target Note')).toContain('- Child content');
  });

  it('creates custom log section if missing in target', async () => {
    const result = await testExtractLogPlugin({
      source: `
- [[Target Note]]
  - Content
      `,
      targetNotes: {
        'Target Note': `
# Target Note

Some existing content
        `
      },
      settings: {
        logExtractionTargetHeading: '## Journal'
      }
    });

    expect(result.target('Target Note')).toContain('## Journal');
    expect(result.target('Target Note')).toContain('### [[daily]]');
    expect(result.target('Target Note')).toContain('- Content');
  });

  it('respects heading level from logExtractionTargetHeading', async () => {
    const result = await testExtractLogPlugin({
      source: `
- [[Target Note]]
  - Child content
      `,
      targetNotes: {
        'Target Note': `
### Notes
        `
      },
      settings: {
        logExtractionTargetHeading: '### Notes'
      }
    });

    expect(result.target('Target Note')).toContain('#### [[daily]]');
  });

  it('preserves indentation when dedenting children', async () => {
    const result = await testExtractLogPlugin({
      source: `
- [[Target Note]]
    - Indented child
        - Deeply nested
      `,
      targetNotes: {
        'Target Note': `
## Log
        `
      }
    });

    const targetContent = result.target('Target Note');
    // Children should be dedented but relative indentation preserved
    expect(targetContent).toContain('- Indented child');
    expect(targetContent).toContain('  - Deeply nested');
  });
});
