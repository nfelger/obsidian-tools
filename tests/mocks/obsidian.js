import { vi } from 'vitest';

/**
 * Create a mock TFile object
 */
export function createMockFile({ path = 'test.md', basename = 'test', extension = 'md' } = {}) {
  return {
    path,
    basename,
    extension
  };
}

/**
 * Create a mock editor
 */
export function createMockEditor({
  content = '',
  cursor = { line: 0, ch: 0 },
  lineCount = null
} = {}) {
  const lines = content.split('\n');
  const actualLineCount = lineCount !== null ? lineCount : lines.length;

  return {
    getValue: vi.fn(() => content),
    getLine: vi.fn((n) => lines[n] || ''),
    lineCount: vi.fn(() => actualLineCount),
    getCursor: vi.fn(() => cursor),
    setLine: vi.fn(),
    replaceRange: vi.fn(),
    replaceSelection: vi.fn(),
    getRange: vi.fn((from, to) => {
      const startLine = from.line;
      const endLine = to.line;
      const rangeLines = [];
      for (let i = startLine; i < endLine && i < lines.length; i++) {
        rangeLines.push(lines[i]);
      }
      return rangeLines.join('\n');
    })
  };
}

/**
 * Create a mock metadataCache
 */
export function createMockMetadataCache({
  fileCache = {},
  linkDests = new Map()
} = {}) {
  return {
    getFileCache: vi.fn((file) => {
      const key = file?.path || 'default';
      return fileCache[key] || null;
    }),
    getFirstLinkpathDest: vi.fn((linkPath, sourcePath) => {
      const key = `${linkPath}|${sourcePath}`;
      return linkDests.get(key) || linkDests.get(linkPath) || null;
    })
  };
}

/**
 * Create a mock vault
 */
export function createMockVault({ files = [] } = {}) {
  return {
    getMarkdownFiles: vi.fn(() => files),
    getAllFolders: vi.fn(() => []),
    create: vi.fn(),
    delete: vi.fn(),
    process: vi.fn(async (file, fn) => {
      // Simulate processing by calling the function with empty content
      const result = await fn('');
      return result;
    }),
    read: vi.fn()
  };
}

/**
 * Create a mock workspace
 */
export function createMockWorkspace({ editor = null, file = null } = {}) {
  const view = {
    editor: editor || createMockEditor(),
    file: file || createMockFile(),
    getViewType: vi.fn(() => 'markdown')
  };

  const leaf = {
    view
  };

  return {
    activeLeaf: leaf,
    getLeaf: vi.fn(() => ({
      openFile: vi.fn()
    }))
  };
}

/**
 * Create a mock Obsidian app
 */
export function createMockApp({
  vault = null,
  metadataCache = null,
  workspace = null
} = {}) {
  return {
    vault: vault || createMockVault(),
    metadataCache: metadataCache || createMockMetadataCache(),
    workspace: workspace || createMockWorkspace()
  };
}

/**
 * Create a mock Templater tp object
 */
export function createMockTp({
  app = null,
  file = null,
  suggesterReturn = null,
  clipboardText = ''
} = {}) {
  return {
    app: app || createMockApp(),
    file: file || { title: 'Test Note', path: 'Test Note.md' },
    config: {
      target_file: file || { path: 'Test Note.md' }
    },
    system: {
      suggester: vi.fn(async () => suggesterReturn),
      clipboard: vi.fn(async () => clipboardText)
    }
  };
}

/**
 * Create mock global Notice function
 */
export function createMockNotice() {
  return vi.fn();
}

/**
 * Create mock navigator.clipboard
 */
export function createMockClipboard() {
  return {
    writeText: vi.fn()
  };
}
