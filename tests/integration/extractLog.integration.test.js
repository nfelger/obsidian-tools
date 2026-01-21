import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockApp,
  createMockEditor,
  createMockFile,
  createMockMetadataCache,
  createMockVault,
  createMockWorkspace,
  createMockTp,
  createMockNotice,
  createMockClipboard
} from '../mocks/obsidian.js';

const { extractLog } = require('../../scripts/extractLog.js');

describe('extractLog integration', () => {
  let mockApp, mockEditor, mockFile, mockMetadataCache, mockVault, mockWorkspace, mockTp;
  let mockNotice, mockClipboard;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Setup global mocks
    mockNotice = createMockNotice();
    vi.stubGlobal('Notice', mockNotice);

    mockClipboard = createMockClipboard();
    vi.stubGlobal('navigator', { clipboard: mockClipboard });
  });

  it('shows error when no active markdown view', async () => {
    // Setup: workspace with no active leaf
    mockWorkspace = createMockWorkspace();
    mockWorkspace.activeLeaf = null;

    mockApp = createMockApp({ workspace: mockWorkspace });
    vi.stubGlobal('app', mockApp);
    mockTp = createMockTp({ app: mockApp });

    await extractLog(mockTp);

    expect(mockNotice).toHaveBeenCalledWith(
      expect.stringContaining('No active markdown view'),
      expect.any(Number)
    );
  });

  it('shows error when view is not markdown', async () => {
    // Setup: view with wrong type
    mockEditor = createMockEditor();
    mockFile = createMockFile();
    mockWorkspace = createMockWorkspace({ editor: mockEditor, file: mockFile });
    mockWorkspace.activeLeaf.view.getViewType = vi.fn(() => 'pdf');

    mockApp = createMockApp({ workspace: mockWorkspace });
    vi.stubGlobal('app', mockApp);
    mockTp = createMockTp({ app: mockApp });

    await extractLog(mockTp);

    expect(mockNotice).toHaveBeenCalledWith(
      expect.stringContaining('No active markdown view'),
      expect.any(Number)
    );
  });

  it('shows error when no active file', async () => {
    // Setup: view with no file
    mockEditor = createMockEditor();
    mockWorkspace = createMockWorkspace({ editor: mockEditor, file: null });
    mockWorkspace.activeLeaf.view.file = null;

    mockApp = createMockApp({ workspace: mockWorkspace });
    vi.stubGlobal('app', mockApp);
    mockTp = createMockTp({ app: mockApp });

    await extractLog(mockTp);

    expect(mockNotice).toHaveBeenCalledWith(
      expect.stringContaining('No active file'),
      expect.any(Number)
    );
  });

  it('shows error when no listItems metadata', async () => {
    // Setup: file cache with no listItems
    mockEditor = createMockEditor({ content: '- Test\n  - Child' });
    mockFile = createMockFile({ path: 'daily.md', basename: 'daily' });
    mockMetadataCache = createMockMetadataCache({
      fileCache: {
        'daily.md': { headings: [] } // No listItems
      }
    });
    mockWorkspace = createMockWorkspace({ editor: mockEditor, file: mockFile });
    mockApp = createMockApp({
      workspace: mockWorkspace,
      metadataCache: mockMetadataCache
    });
    vi.stubGlobal('app', mockApp);
    mockTp = createMockTp({ app: mockApp });

    await extractLog(mockTp);

    expect(mockNotice).toHaveBeenCalledWith(
      expect.stringContaining('No listItems metadata'),
      expect.any(Number)
    );
  });

  it('shows message when no children under current bullet', async () => {
    // Setup: list item with no children
    const content = '- Parent item\n- Sibling item';
    mockEditor = createMockEditor({ content, cursor: { line: 0, ch: 0 } });
    mockFile = createMockFile({ path: 'daily.md', basename: 'daily' });

    const listItems = [
      {
        position: { start: { line: 0 }, end: { line: 0 } },
        parent: -1
      },
      {
        position: { start: { line: 1 }, end: { line: 1 } },
        parent: -1
      }
    ];

    mockMetadataCache = createMockMetadataCache({
      fileCache: {
        'daily.md': { listItems }
      }
    });
    mockWorkspace = createMockWorkspace({ editor: mockEditor, file: mockFile });
    mockApp = createMockApp({
      workspace: mockWorkspace,
      metadataCache: mockMetadataCache
    });
    vi.stubGlobal('app', mockApp);
    mockTp = createMockTp({ app: mockApp });

    await extractLog(mockTp);

    expect(mockNotice).toHaveBeenCalledWith(
      expect.stringContaining('No children'),
      expect.any(Number)
    );
  });

  it('extracts children to target note with wikilink', async () => {
    // Setup: parent with wikilink and children
    const content = '- [[Target Note]]\n  - Child 1\n  - Child 2';
    mockEditor = createMockEditor({ content, cursor: { line: 0, ch: 0 } });
    mockFile = createMockFile({ path: 'daily.md', basename: 'daily' });

    const targetFile = createMockFile({
      path: 'Target Note.md',
      basename: 'Target Note'
    });

    const listItems = [
      {
        position: { start: { line: 0 }, end: { line: 0 } },
        parent: -1
      },
      {
        position: { start: { line: 1 }, end: { line: 1 } },
        parent: 0
      },
      {
        position: { start: { line: 2 }, end: { line: 2 } },
        parent: 0
      }
    ];

    const linkDests = new Map();
    linkDests.set('Target Note|daily.md', targetFile);

    mockMetadataCache = createMockMetadataCache({
      fileCache: {
        'daily.md': { listItems },
        'Target Note.md': {
          headings: [
            { level: 2, heading: 'Log', position: { start: { line: 5 } } }
          ]
        }
      },
      linkDests
    });

    mockVault = createMockVault({ files: [mockFile, targetFile] });
    mockWorkspace = createMockWorkspace({ editor: mockEditor, file: mockFile });
    mockApp = createMockApp({
      workspace: mockWorkspace,
      metadataCache: mockMetadataCache,
      vault: mockVault
    });
    vi.stubGlobal('app', mockApp);
    mockTp = createMockTp({ app: mockApp });

    await extractLog(mockTp);

    // Verify children were removed from source
    expect(mockEditor.replaceRange).toHaveBeenCalledWith(
      '',
      { line: 1, ch: 0 },
      { line: 3, ch: 0 }
    );

    // Verify wikilink was updated in parent
    expect(mockEditor.setLine).toHaveBeenCalled();

    // Verify content was added to target
    expect(mockVault.process).toHaveBeenCalledWith(
      targetFile,
      expect.any(Function)
    );

    // Verify success message
    expect(mockNotice).toHaveBeenCalledWith(
      expect.stringContaining('moved child block'),
      expect.any(Number)
    );
  });

  it('handles error gracefully', async () => {
    // Setup: trigger an error by having null workspace
    mockApp = createMockApp();
    mockApp.workspace = null;
    vi.stubGlobal('app', mockApp);
    mockTp = createMockTp({ app: mockApp });

    await extractLog(mockTp);

    // Verify error message
    expect(mockNotice).toHaveBeenCalledWith(
      expect.stringContaining('ERROR'),
      8000
    );
  });
});
