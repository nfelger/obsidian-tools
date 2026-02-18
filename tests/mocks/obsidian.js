import { vi } from 'vitest';
import momentLib from 'moment';

// Export moment as Obsidian does
export const moment = momentLib;

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
 *
 * @param {Object} options
 * @param {string} options.content - Editor content
 * @param {Object} options.cursor - Cursor position { line, ch }
 * @param {Object} options.selectionStart - Selection start { line, ch } (defaults to cursor)
 * @param {Object} options.selectionEnd - Selection end { line, ch } (defaults to cursor)
 * @param {number} options.lineCount - Override line count
 */
export function createMockEditor({
  content = '',
  cursor = { line: 0, ch: 0 },
  selectionStart = null,
  selectionEnd = null,
  lineCount = null
} = {}) {
  const lines = content.split('\n');
  const actualLineCount = lineCount !== null ? lineCount : lines.length;

  // Default selection to cursor position (no selection)
  const from = selectionStart || cursor;
  const to = selectionEnd || cursor;

  return {
    getValue: vi.fn(() => content),
    getLine: vi.fn((n) => lines[n] || ''),
    lineCount: vi.fn(() => actualLineCount),
    getCursor: vi.fn((type) => {
      if (type === 'from') return from;
      if (type === 'to') return to;
      return cursor;
    }),
    somethingSelected: vi.fn(() => from.line !== to.line || from.ch !== to.ch),
    listSelections: vi.fn(() => {
      // Return array of selections with anchor/head format
      // anchor is where selection started, head is where it ended
      return [{
        anchor: from,
        head: to
      }];
    }),
    setLine: vi.fn(),
    replaceRange: vi.fn(),
    replaceSelection: vi.fn(),
    getRange: vi.fn((rangeFrom, rangeTo) => {
      const startLine = rangeFrom.line;
      const endLine = rangeTo.line;
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
    })),
    getActiveViewOfType: vi.fn((type) => {
      // Return the view if it matches the requested type
      if (type.name === 'MarkdownView') {
        return view;
      }
      return null;
    })
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

/**
 * Mock Obsidian API classes
 * These are used when importing from 'obsidian' in plugin code
 */

// Mock Notice class
export class Notice {
  constructor(message, duration) {
    // Store for testing
    this.message = message;
    this.duration = duration;
  }
}

// Mock MarkdownView class
export class MarkdownView {
  constructor() {
    this.editor = null;
    this.file = null;
  }
}

// Mock TFile class
export class TFile {
  constructor(path) {
    this.path = path;
    this.basename = path.replace('.md', '').split('/').pop();
    this.extension = 'md';
  }
}

// Mock Plugin class
export class Plugin {
  constructor() {
    this.app = null;
  }

  async onload() {}
  onunload() {}
  addCommand() {}
}

// Mock Scope class for keyboard handling in modals
export class Scope {
  constructor() {
    this.keys = [];
  }

  register(modifiers, key, callback) {
    const handler = { modifiers, key, callback };
    this.keys.push(handler);
    return handler;
  }

  unregister(handler) {
    const index = this.keys.indexOf(handler);
    if (index > -1) {
      this.keys.splice(index, 1);
    }
  }
}

// Helper to create mock HTML elements
function createMockElement() {
  const listeners = {};
  const element = {
    addClass: vi.fn(() => element),
    removeClass: vi.fn(() => element),
    createDiv: vi.fn(() => createMockElement()),
    createSpan: vi.fn(() => createMockElement()),
    createEl: vi.fn(() => createMockElement()),
    empty: vi.fn(() => element),
    setText: vi.fn(() => element),
    addEventListener: vi.fn((event, handler) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    dispatchEvent: vi.fn((event) => {
      const handlers = listeners[event.type] || [];
      handlers.forEach(h => h(event));
    }),
    textContent: '',
    children: []
  };
  return element;
}

// Mock Modal class
export class Modal {
  constructor(app) {
    this.app = app;
    this.contentEl = createMockElement();
    this.modalEl = createMockElement();
    this.scope = new Scope();
    this.isOpen = false;
  }

  open() {
    this.isOpen = true;
    this.onOpen();
  }

  close() {
    this.isOpen = false;
    this.onClose();
  }

  onOpen() {}
  onClose() {}
}

// Mock SuggestModal class
export class SuggestModal extends Modal {
  constructor(app) {
    super(app);
    this.inputEl = createMockElement();
    this.resultContainerEl = createMockElement();
    this.emptyStateText = '';
    this.limit = Infinity;
  }

  setPlaceholder() {}
  setInstructions() {}
  getSuggestions() { return []; }
  renderSuggestion() {}
  onChooseSuggestion() {}
  onNoSuggestion() {}
}

// Mock FuzzySuggestModal class
export class FuzzySuggestModal extends SuggestModal {
  constructor(app) {
    super(app);
  }

  getItems() { return []; }
  getItemText() { return ''; }
  onChooseItem() {}
}
