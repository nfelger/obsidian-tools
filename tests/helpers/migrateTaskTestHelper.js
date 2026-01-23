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
  createMockNotice
} from '../mocks/obsidian.js';

/**
 * Test migrateTask with markdown-first approach
 *
 * @param {Object} options
 * @param {string} options.source - Source markdown content
 * @param {string} options.sourceFileName - Source file basename (e.g., "2026-01-22 Thu")
 * @param {string} options.targetContent - Target note content (null = doesn't exist)
 * @param {string} options.targetFileName - Target file basename (auto-calculated if not provided)
 * @param {number} options.cursorLine - Line where cursor is positioned (default: 0)
 * @param {number} options.selectionStartLine - Selection start line (for multi-select)
 * @param {number} options.selectionEndLine - Selection end line (for multi-select)
 * @param {string} options.diaryFolder - Diary folder path (default: '+Diary')
 * @returns {Promise<Object>} Result with source, target, error, notices
 */
export async function testMigrateTask({
  source,
  sourceFileName,
  targetContent = '',
  targetFileName = null,
  cursorLine = 0,
  selectionStartLine = null,
  selectionEndLine = null,
  diaryFolder = '+Diary'
}) {
  // Normalize markdown
  const normalizedSource = normalizeMarkdown(source);

  // Parse source markdown → listItems
  const listItems = parseMarkdownToListItems(normalizedSource);

  // Track content state
  let sourceContent = normalizedSource;
  let targetContentState = targetContent !== null ? normalizeMarkdown(targetContent) : null;
  const targetExists = targetContent !== null;

  // Build full paths
  const { parseNoteType, getNextNotePath } = require('../../scripts/migrateTask.js');
  const noteInfo = parseNoteType(sourceFileName);

  // Calculate source path based on note type
  let sourcePath;
  if (noteInfo) {
    const { type, year, month } = noteInfo;
    const yearStr = String(year);
    const monthStr = month ? String(month).padStart(2, '0') : null;

    switch (type) {
      case 'daily':
      case 'weekly':
        sourcePath = `${diaryFolder}/${yearStr}/${monthStr}/${sourceFileName}.md`;
        break;
      case 'monthly':
        sourcePath = `${diaryFolder}/${yearStr}/${sourceFileName}.md`;
        break;
      case 'yearly':
        sourcePath = `${diaryFolder}/${yearStr}/${sourceFileName}.md`;
        break;
    }
  } else {
    sourcePath = `${sourceFileName}.md`;
  }

  // Calculate target path
  const calculatedTargetPath = noteInfo ? getNextNotePath(noteInfo, diaryFolder) : null;
  const actualTargetFileName = targetFileName || (calculatedTargetPath ? calculatedTargetPath.split('/').pop() : null);
  const targetPath = calculatedTargetPath ? `${calculatedTargetPath}.md` : null;

  // Create editor that tracks modifications
  // Support both single cursor and selection range
  const hasSelection = selectionStartLine !== null && selectionEndLine !== null;
  const mockEditor = createMockEditor({
    content: sourceContent,
    cursor: { line: cursorLine, ch: 0 },
    selectionStart: hasSelection ? { line: selectionStartLine, ch: 0 } : null,
    selectionEnd: hasSelection ? { line: selectionEndLine, ch: 0 } : null
  });

  // Override editor methods to track changes
  mockEditor.replaceRange = vi.fn((text, from, to) => {
    const lines = sourceContent.split('\n');
    const beforeLines = lines.slice(0, from.line);
    const afterLines = lines.slice(to.line);
    const newLines = text === '' ? [] : text.split('\n');
    sourceContent = [...beforeLines, ...newLines, ...afterLines].join('\n');
  });

  mockEditor.setLine = vi.fn((lineNum, text) => {
    const lines = sourceContent.split('\n');
    lines[lineNum] = text;
    sourceContent = lines.join('\n');
  });

  // Build file cache
  const fileCache = {
    [sourcePath]: { listItems }
  };

  // Add target file cache if it exists
  if (targetExists && targetPath) {
    const targetLines = normalizeMarkdown(targetContentState).split('\n');
    const headings = [];
    targetLines.forEach((line, idx) => {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        headings.push({
          level: headingMatch[1].length,
          heading: headingMatch[2],
          position: { start: { line: idx } }
        });
      }
    });
    fileCache[targetPath] = { headings };
  }

  // Setup files
  const allFiles = [];
  const mockSourceFile = createMockFile({
    path: sourcePath,
    basename: sourceFileName
  });
  allFiles.push(mockSourceFile);

  let mockTargetFile = null;
  if (targetExists && actualTargetFileName) {
    mockTargetFile = createMockFile({
      path: targetPath,
      basename: actualTargetFileName
    });
    allFiles.push(mockTargetFile);
  }

  // Create vault that tracks modifications
  const mockVault = createMockVault({ files: allFiles });

  // Override getAbstractFileByPath to check if target exists
  mockVault.getAbstractFileByPath = vi.fn((path) => {
    if (path === targetPath && targetExists) {
      return mockTargetFile;
    }
    if (path === sourcePath) {
      return mockSourceFile;
    }
    return null;
  });

  mockVault.process = vi.fn(async (file, processFn) => {
    if (file === mockTargetFile || file?.path === targetPath) {
      const currentContent = targetContentState || '';
      const newContent = await processFn(currentContent);
      targetContentState = newContent;
      return newContent;
    }
    return '';
  });

  // Create metadata cache
  const mockMetadataCache = createMockMetadataCache({
    fileCache
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
  const errors = [];
  const mockNotice = createMockNotice();
  mockNotice.mockImplementation((msg) => {
    notices.push(msg);
    if (msg.includes('ERROR') || msg.includes('error')) {
      errors.push(msg);
    }
  });

  vi.stubGlobal('app', mockApp);
  vi.stubGlobal('Notice', mockNotice);

  // Create tp object
  const mockTp = createMockTp({ app: mockApp });
  mockTp.file = { title: sourceFileName, path: sourcePath };

  // Import and run migrateTask
  const { migrateTask } = require('../../scripts/migrateTask.js');
  await migrateTask(mockTp);

  // Return clean result
  return {
    source: normalizeMarkdown(sourceContent),
    target: targetContentState ? normalizeMarkdown(targetContentState) : null,
    targetPath: calculatedTargetPath,
    error: errors[0] || null,
    notice: notices[0] || null,
    notices,
    // For debugging
    _editor: mockEditor,
    _vault: mockVault,
    _noteInfo: noteInfo
  };
}
