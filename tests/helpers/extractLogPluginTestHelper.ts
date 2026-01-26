import { vi } from 'vitest';
import { parseMarkdownToListItems, normalizeMarkdown } from './markdownParser.js';
import {
  createMockApp,
  createMockEditor,
  createMockFile,
  createMockMetadataCache,
  createMockVault,
  createMockWorkspace,
  createMockNotice,
  createMockClipboard
} from '../mocks/obsidian.js';
import type { ListItem } from '../../src/types';
import { DEFAULT_SETTINGS } from '../../src/types';
import type BulletFlowPlugin from '../../src/main';

interface TestExtractLogOptions {
  source: string;
  targetNotes?: Record<string, string>;
  cursorLine?: number;
  fileName?: string;
}

interface TestExtractLogResult {
  source: string;
  target: (name: string) => string | null;
  error: string | null;
  notice: string | null;
  notices: string[];
}

/**
 * Test extractLog (plugin version) with markdown-first approach
 *
 * @param options - Test configuration
 * @param options.source - Source markdown content
 * @param options.targetNotes - Target notes as { 'NoteName': 'markdown content' }
 * @param options.cursorLine - Line where cursor is positioned (default: 0)
 * @param options.fileName - Source file name (default: 'daily.md')
 * @returns Result with source, target(), error, notice
 */
export async function testExtractLogPlugin({
  source,
  targetNotes = {},
  cursorLine = 0,
  fileName = 'daily.md'
}: TestExtractLogOptions): Promise<TestExtractLogResult> {
  // Normalize markdown
  const normalizedSource = normalizeMarkdown(source);

  // Parse source markdown → listItems
  const listItems = parseMarkdownToListItems(normalizedSource) as ListItem[];

  // Track content state
  let sourceContent = normalizedSource;
  const targetContents = new Map<string, string>();
  const errors: string[] = [];

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
  mockEditor.replaceRange = vi.fn((text: string, from: any, to: any) => {
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

  mockEditor.setLine = vi.fn((lineNum: number, text: string) => {
    const lines = sourceContent.split('\n');
    lines[lineNum] = text;
    sourceContent = lines.join('\n');
  });

  // Build file cache
  const fileCache: Record<string, any> = {
    [fileName]: { listItems }
  };

  // Setup target notes in cache
  const linkDests = new Map<string, any>();
  const allFiles: any[] = [];
  const mockSourceFile = createMockFile({
    path: fileName,
    basename: fileName.replace('.md', '')
  });
  allFiles.push(mockSourceFile);

  for (const [name, content] of Object.entries(targetNotes)) {
    const targetPath = `${name}.md`;

    // Parse target note for headings
    const targetLines = normalizeMarkdown(content).split('\n');
    const headings: any[] = [];
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
  mockVault.process = vi.fn(async (file: any, processFn: (data: string) => string) => {
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
  const notices: string[] = [];
  vi.stubGlobal('navigator', { clipboard: createMockClipboard() });

  // Spy on Notice constructor to track messages
  const NoticeModule = await import('obsidian');
  const NoticeSpy = vi.spyOn(NoticeModule, 'Notice').mockImplementation(function(this: any, msg: string) {
    notices.push(msg);
    if (msg.includes('ERROR') || msg.includes('error')) {
      errors.push(msg);
    }
    this.message = msg;
    return this;
  } as any);

  // Create mock plugin
  const mockPlugin = {
    app: mockApp,
    settings: DEFAULT_SETTINGS
  } as BulletFlowPlugin;

  // Import and run extractLog
  const { extractLog } = await import('../../src/commands/extractLog');
  await extractLog(mockPlugin);

  // Cleanup
  NoticeSpy.mockRestore();

  // Return clean result
  return {
    source: normalizeMarkdown(sourceContent),
    target: (name: string) => {
      const content = targetContents.get(name);
      return content ? normalizeMarkdown(content) : null;
    },
    error: errors[0] || null,
    notice: notices[0] || null,
    notices: notices
  };
}
