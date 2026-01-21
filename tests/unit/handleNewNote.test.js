import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockApp,
  createMockFile,
  createMockVault,
  createMockWorkspace,
  createMockTp
} from '../mocks/obsidian.js';

const handleNewNote = require('../../scripts/handleNewNote.js');

describe('handleNewNote', () => {
  let mockApp, mockVault, mockWorkspace, mockTp;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters out hidden folders (starting with .)', async () => {
    const folders = [
      { path: 'visible' },
      { path: '.hidden' },
      { path: 'parent/.hidden/child' },
      { path: 'normal/folder' }
    ];

    mockVault = createMockVault();
    mockVault.getAllFolders = vi.fn(() => folders);
    mockVault.delete = vi.fn();
    mockVault.create = vi.fn(() => createMockFile({ path: 'visible/Test.md' }));

    mockWorkspace = createMockWorkspace();
    mockApp = createMockApp({ vault: mockVault, workspace: mockWorkspace });
    vi.stubGlobal('app', mockApp);

    mockTp = createMockTp({ app: mockApp });
    mockTp.file = { title: 'Test' };
    mockTp.config = { target_file: createMockFile() };
    mockTp.system.suggester = vi.fn(async (display, values) => {
      // Verify hidden folders are filtered out
      expect(display).not.toContain('.hidden');
      expect(display).not.toContain('parent/.hidden/child');
      expect(display).toContain('visible');
      expect(display).toContain('normal/folder');
      return 'visible';
    });

    await handleNewNote(mockTp);

    expect(mockTp.system.suggester).toHaveBeenCalled();
  });

  it('filters out journal folders (+Diary/)', async () => {
    const folders = [
      { path: 'normal' },
      { path: '+Diary/2024' },
      { path: '+Diary/2024/01' },
      { path: 'other' }
    ];

    mockVault = createMockVault();
    mockVault.getAllFolders = vi.fn(() => folders);
    mockVault.delete = vi.fn();
    mockVault.create = vi.fn(() => createMockFile());

    mockWorkspace = createMockWorkspace();
    mockApp = createMockApp({ vault: mockVault, workspace: mockWorkspace });
    vi.stubGlobal('app', mockApp);

    mockTp = createMockTp({ app: mockApp });
    mockTp.file = { title: 'Test' };
    mockTp.config = { target_file: createMockFile() };
    mockTp.system.suggester = vi.fn(async (display) => {
      expect(display).not.toContain('+Diary/2024');
      expect(display).not.toContain('+Diary/2024/01');
      expect(display).toContain('normal');
      return 'normal';
    });

    await handleNewNote(mockTp);
  });

  it('filters out old notes folder', async () => {
    const folders = [
      { path: 'normal' },
      { path: '4 Archive/Alte Notes-Systeme' },
      { path: '4 Archive/other' }
    ];

    mockVault = createMockVault();
    mockVault.getAllFolders = vi.fn(() => folders);
    mockVault.delete = vi.fn();
    mockVault.create = vi.fn(() => createMockFile());

    mockWorkspace = createMockWorkspace();
    mockApp = createMockApp({ vault: mockVault, workspace: mockWorkspace });
    vi.stubGlobal('app', mockApp);

    mockTp = createMockTp({ app: mockApp });
    mockTp.file = { title: 'Test' };
    mockTp.config = { target_file: createMockFile() };
    mockTp.system.suggester = vi.fn(async (display) => {
      expect(display).not.toContain('4 Archive/Alte Notes-Systeme');
      expect(display).toContain('4 Archive/other');
      return 'normal';
    });

    await handleNewNote(mockTp);
  });

  it('adds root folder option at the beginning', async () => {
    const folders = [{ path: 'folder1' }, { path: 'folder2' }];

    mockVault = createMockVault();
    mockVault.getAllFolders = vi.fn(() => folders);
    mockVault.delete = vi.fn();
    mockVault.create = vi.fn(() => createMockFile());

    mockWorkspace = createMockWorkspace();
    mockApp = createMockApp({ vault: mockVault, workspace: mockWorkspace });
    vi.stubGlobal('app', mockApp);

    mockTp = createMockTp({ app: mockApp });
    mockTp.file = { title: 'Test' };
    mockTp.config = { target_file: createMockFile() };
    mockTp.system.suggester = vi.fn(async (display, values) => {
      expect(display[0]).toBe('/ (root)');
      expect(values[0]).toBe('/');
      return '/';
    });

    await handleNewNote(mockTp);
  });

  it('creates note in root when root is chosen', async () => {
    const folders = [{ path: 'folder1' }];

    mockVault = createMockVault();
    mockVault.getAllFolders = vi.fn(() => folders);
    mockVault.delete = vi.fn();
    mockVault.create = vi.fn(() => createMockFile({ path: 'MyNote.md' }));

    mockWorkspace = createMockWorkspace();
    mockApp = createMockApp({ vault: mockVault, workspace: mockWorkspace });
    vi.stubGlobal('app', mockApp);

    mockTp = createMockTp({ app: mockApp });
    mockTp.file = { title: 'MyNote' };
    mockTp.config = { target_file: createMockFile() };
    mockTp.system.suggester = vi.fn(async () => '/');

    await handleNewNote(mockTp);

    expect(mockVault.create).toHaveBeenCalledWith('MyNote.md', '');
  });

  it('creates note in chosen subfolder', async () => {
    const folders = [{ path: 'Projects' }, { path: 'Areas' }];

    mockVault = createMockVault();
    mockVault.getAllFolders = vi.fn(() => folders);
    mockVault.delete = vi.fn();
    mockVault.create = vi.fn(() => createMockFile({ path: 'Projects/MyNote.md' }));

    mockWorkspace = createMockWorkspace();
    mockApp = createMockApp({ vault: mockVault, workspace: mockWorkspace });
    vi.stubGlobal('app', mockApp);

    mockTp = createMockTp({ app: mockApp });
    mockTp.file = { title: 'MyNote' };
    mockTp.config = { target_file: createMockFile() };
    mockTp.system.suggester = vi.fn(async () => 'Projects');

    await handleNewNote(mockTp);

    expect(mockVault.create).toHaveBeenCalledWith('Projects/MyNote.md', '');
  });

  it('deletes current file before creating new one', async () => {
    const folders = [{ path: 'folder' }];
    const currentFile = createMockFile({ path: 'temp.md' });

    mockVault = createMockVault();
    mockVault.getAllFolders = vi.fn(() => folders);
    mockVault.delete = vi.fn();
    mockVault.create = vi.fn(() => createMockFile());

    mockWorkspace = createMockWorkspace();
    mockApp = createMockApp({ vault: mockVault, workspace: mockWorkspace });
    vi.stubGlobal('app', mockApp);

    mockTp = createMockTp({ app: mockApp });
    mockTp.file = { title: 'MyNote' };
    mockTp.config = { target_file: currentFile };
    mockTp.system.suggester = vi.fn(async () => 'folder');

    await handleNewNote(mockTp);

    expect(mockVault.delete).toHaveBeenCalledWith(currentFile);
  });

  it('returns empty string when user cancels', async () => {
    const folders = [{ path: 'folder' }];

    mockVault = createMockVault();
    mockVault.getAllFolders = vi.fn(() => folders);
    mockVault.delete = vi.fn();
    mockVault.create = vi.fn();

    mockWorkspace = createMockWorkspace();
    mockApp = createMockApp({ vault: mockVault, workspace: mockWorkspace });
    vi.stubGlobal('app', mockApp);

    mockTp = createMockTp({ app: mockApp });
    mockTp.file = { title: 'MyNote' };
    mockTp.config = { target_file: createMockFile() };
    mockTp.system.suggester = vi.fn(async () => null);

    const result = await handleNewNote(mockTp);

    expect(result).toBe('');
    expect(mockVault.create).not.toHaveBeenCalled();
  });

  it('opens the newly created file', async () => {
    const folders = [{ path: 'folder' }];
    const newFile = createMockFile({ path: 'folder/MyNote.md' });

    mockVault = createMockVault();
    mockVault.getAllFolders = vi.fn(() => folders);
    mockVault.delete = vi.fn();
    mockVault.create = vi.fn(() => newFile);

    const openFileMock = vi.fn();
    mockWorkspace = createMockWorkspace();
    mockWorkspace.getLeaf = vi.fn(() => ({ openFile: openFileMock }));

    mockApp = createMockApp({ vault: mockVault, workspace: mockWorkspace });
    vi.stubGlobal('app', mockApp);

    mockTp = createMockTp({ app: mockApp });
    mockTp.file = { title: 'MyNote' };
    mockTp.config = { target_file: createMockFile() };
    mockTp.system.suggester = vi.fn(async () => 'folder');

    await handleNewNote(mockTp);

    expect(mockWorkspace.getLeaf).toHaveBeenCalledWith(false);
    expect(openFileMock).toHaveBeenCalledWith(newFile);
  });

  it('sorts folders alphabetically', async () => {
    const folders = [{ path: 'zebra' }, { path: 'alpha' }, { path: 'beta' }];

    mockVault = createMockVault();
    mockVault.getAllFolders = vi.fn(() => folders);
    mockVault.delete = vi.fn();
    mockVault.create = vi.fn(() => createMockFile());

    mockWorkspace = createMockWorkspace();
    mockApp = createMockApp({ vault: mockVault, workspace: mockWorkspace });
    vi.stubGlobal('app', mockApp);

    mockTp = createMockTp({ app: mockApp });
    mockTp.file = { title: 'Test' };
    mockTp.config = { target_file: createMockFile() };
    mockTp.system.suggester = vi.fn(async (display, values) => {
      // Check that folders are sorted (after root which is first)
      expect(values[0]).toBe('/');
      expect(values[1]).toBe('alpha');
      expect(values[2]).toBe('beta');
      expect(values[3]).toBe('zebra');
      return 'alpha';
    });

    await handleNewNote(mockTp);
  });
});
