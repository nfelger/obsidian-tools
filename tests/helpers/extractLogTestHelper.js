import { vi } from 'vitest';
import { parseMarkdownToListItems, normalizeMarkdown } from './markdownParser.js';
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

/**
 * Test extractLog with markdown-first approach
 *
 * @param {Object} options
 * @param {string} options.source - Source markdown content
 * @param {Object} options.targetNotes - Target notes as { 'NoteName': 'markdown content' }
 * @param {number} options.cursorLine - Line where cursor is positioned (default: 0)
 * @param {string} options.fileName - Source file name (default: 'daily.md')
 * @returns {Promise<Object>} Result with source, target(), error, notice
 */
export async function testExtractLog({
  source,
  targetNotes = {},
  cursorLine = 0,
  fileName = 'daily.md'
}) {
  // Normalize markdown
  const normalizedSource = normalizeMarkdown(source);

  // Parse source markdown → listItems
  const listItems = parseMarkdownToListItems(normalizedSource);

  // Track content state
  let sourceContent = normalizedSource;
  const targetContents = new Map();
  const errors = [];

  // Initialize target note contents
  for (const [name, content] of Object.entries(targetNotes)) {
    targetContents.set(name, normalizeMarkdown(content));
  }

  // Create editor that tracks modifications
  const mockEditor = createMockEditor({
    content: sourceContent,
    cursor: { line: cursorLine, ch: 0 }
  });

  // Override editor methods to track changes
  mockEditor.replaceRange = vi.fn((text, from, to) => {
    const lines = sourceContent.split('\n');
    const deleteCount = to.line - from.line;

    if (text === '') {
      // Deletion
      lines.splice(from.line, deleteCount);
    } else {
      // Replacement
      lines.splice(from.line, deleteCount, text);
    }

    sourceContent = lines.join('\n');
  });

  mockEditor.setLine = vi.fn((lineNum, text) => {
    const lines = sourceContent.split('\n');
    lines[lineNum] = text;
    sourceContent = lines.join('\n');
  });

  // Build file cache
  const fileCache = {
    [fileName]: { listItems }
  };

  // Setup target notes in cache
  const linkDests = new Map();
  const allFiles = [];
  const mockSourceFile = createMockFile({
    path: fileName,
    basename: fileName.replace('.md', '')
  });
  allFiles.push(mockSourceFile);

  for (const [name, content] of Object.entries(targetNotes)) {
    const targetPath = `${name}.md`;

    // Parse target note for headings
    const targetLines = normalizeMarkdown(content).split('\n');
    const headings = [];
    targetLines.forEach((line, idx) => {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const heading = headingMatch[2];
        headings.push({
          level,
          heading,
          position: { start: { line: idx } }
        });
      }
    });

    fileCache[targetPath] = { headings };

    const targetFile = createMockFile({ path: targetPath, basename: name });
    allFiles.push(targetFile);
    linkDests.set(`${name}|${fileName}`, targetFile);
    linkDests.set(name, targetFile);
  }

  // Create vault that tracks modifications
  const mockVault = createMockVault({ files: allFiles });
  mockVault.process = vi.fn(async (file, processFn) => {
    const targetName = file.basename;
    const currentContent = targetContents.get(targetName) || '';
    const newContent = await processFn(currentContent);
    targetContents.set(targetName, newContent);
    return newContent;
  });

  // Create metadata cache
  const mockMetadataCache = createMockMetadataCache({
    fileCache,
    linkDests
  });

  // Create workspace
  const mockWorkspace = createMockWorkspace({
    editor: mockEditor,
    file: mockSourceFile
  });

  // Create app
  const mockApp = createMockApp({
    workspace: mockWorkspace,
    metadataCache: mockMetadataCache,
    vault: mockVault
  });

  // Setup globals
  const notices = [];
  const mockNotice = createMockNotice();
  mockNotice.mockImplementation((msg) => {
    notices.push(msg);
    if (msg.includes('ERROR') || msg.includes('error')) {
      errors.push(msg);
    }
  });

  vi.stubGlobal('app', mockApp);
  vi.stubGlobal('Notice', mockNotice);
  vi.stubGlobal('navigator', { clipboard: createMockClipboard() });

  // Create tp object
  const mockTp = createMockTp({ app: mockApp });
  mockTp.file = { title: fileName.replace('.md', ''), path: fileName };

  // Import and run extractLog
  const { extractLog } = require('../../scripts/extractLog.js');
  await extractLog(mockTp);

  // Return clean result
  return {
    source: normalizeMarkdown(sourceContent),
    target: (name) => {
      const content = targetContents.get(name);
      return content ? normalizeMarkdown(content) : null;
    },
    error: errors[0] || null,
    notice: notices[0] || null,
    notices: notices,
    // For debugging if needed
    _editor: mockEditor,
    _vault: mockVault
  };
}
