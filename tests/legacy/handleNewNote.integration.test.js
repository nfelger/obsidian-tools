import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testHandleNewNote } from './handleNewNoteTestHelper.js';

describe('handleNewNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('folder filtering', () => {
    it('filters out hidden folders (starting with .)', async () => {
      const result = await testHandleNewNote({
        folders: ['visible', '.hidden', 'parent/.hidden/child', 'normal/folder'],
        fileName: 'Test',
        userChoice: 'visible'
      });

      expect(result.displayedFolders).toEqual(['/ (root)', 'normal/folder', 'visible']);
    });

    it('filters out journal folders (+Diary/)', async () => {
      const result = await testHandleNewNote({
        folders: ['normal', '+Diary/2024', '+Diary/2024/01', 'other'],
        fileName: 'Test',
        userChoice: 'normal'
      });

      expect(result.displayedFolders).toEqual(['/ (root)', 'normal', 'other']);
    });

    it('filters out old notes folder', async () => {
      const result = await testHandleNewNote({
        folders: ['normal', '4 Archive/Alte Notes-Systeme', '4 Archive/other'],
        fileName: 'Test',
        userChoice: 'normal'
      });

      expect(result.displayedFolders).toEqual(['/ (root)', '4 Archive/other', 'normal']);
    });

    it('sorts folders alphabetically', async () => {
      const result = await testHandleNewNote({
        folders: ['zebra', 'alpha', 'beta'],
        fileName: 'Test',
        userChoice: 'alpha'
      });

      expect(result.displayedValues).toEqual(['/', 'alpha', 'beta', 'zebra']);
    });
  });

  describe('root folder handling', () => {
    it('adds root folder option at the beginning', async () => {
      const result = await testHandleNewNote({
        folders: ['folder1', 'folder2'],
        fileName: 'Test',
        userChoice: 'folder1'
      });

      expect(result.displayedFolders[0]).toBe('/ (root)');
      expect(result.displayedValues[0]).toBe('/');
    });

    it('creates note in root when root is chosen', async () => {
      const result = await testHandleNewNote({
        folders: ['folder1'],
        fileName: 'MyNote',
        userChoice: '/'
      });

      expect(result.createdPath).toBe('MyNote.md');
    });
  });

  describe('note creation', () => {
    it('creates note in chosen subfolder', async () => {
      const result = await testHandleNewNote({
        folders: ['Projects', 'Areas'],
        fileName: 'MyNote',
        userChoice: 'Projects'
      });

      expect(result.createdPath).toBe('Projects/MyNote.md');
    });

    it('deletes current file before creating new one', async () => {
      const result = await testHandleNewNote({
        folders: ['folder'],
        fileName: 'MyNote',
        userChoice: 'folder',
        currentFilePath: 'temp.md'
      });

      expect(result.deletedFile).toBe('temp.md');
      expect(result.createdPath).toBe('folder/MyNote.md');
    });

    it('opens the newly created file', async () => {
      const result = await testHandleNewNote({
        folders: ['folder'],
        fileName: 'MyNote',
        userChoice: 'folder'
      });

      expect(result.openedFile).toBe('folder/MyNote.md');
    });
  });

  describe('cancellation', () => {
    it('returns empty string when user cancels', async () => {
      const result = await testHandleNewNote({
        folders: ['folder'],
        fileName: 'MyNote',
        userChoice: null
      });

      expect(result.cancelled).toBe(true);
      expect(result.returnValue).toBe('');
      expect(result.createdPath).toBeNull();
    });
  });
});
