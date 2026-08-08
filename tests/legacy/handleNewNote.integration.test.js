import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { testHandleNewNote } from './handleNewNoteTestHelper.js';

describe('handleNewNote', () => {
  // The script claims paths for a few seconds to recognise re-triggered runs.
  // Each test starts a minute further on so no claim outlives its own case.
  let clockOffset = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    clockOffset += 60_000;
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + clockOffset);
  });

  afterEach(() => {
    vi.useRealTimers();
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

    it('switches the editor off the old note before deleting it', async () => {
      const result = await testHandleNewNote({
        folders: ['folder'],
        fileName: 'MyNote',
        userChoice: 'folder',
        currentFilePath: 'temp.md'
      });

      // Deleting while the note is still open makes Obsidian write the
      // outgoing editor buffer back, recreating the file it just removed.
      expect(result.operations).toEqual(['create', 'open', 'delete']);
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

    it('leaves the placeholder note in place when user cancels', async () => {
      const result = await testHandleNewNote({
        folders: ['folder'],
        fileName: 'MyNote',
        userChoice: null,
        currentFilePath: 'Inbox/Untitled.md'
      });

      expect(result.deletedFile).toBeNull();
    });
  });

  describe('re-entrancy', () => {
    it('does nothing when run again on a note it just placed', async () => {
      await testHandleNewNote({
        folders: ['Projekte'],
        fileName: 'MyNote',
        userChoice: 'Projekte',
        currentFilePath: 'Inbox/MyNote.md'
      });

      // Templater's new-file trigger fires on the note the script just created,
      // running this same template a second time.
      const reentrant = await testHandleNewNote({
        folders: ['Projekte'],
        fileName: 'MyNote',
        userChoice: 'Projekte',
        currentFilePath: 'Projekte/MyNote.md'
      });

      expect(reentrant.displayedFolders).toEqual([]);
      expect(reentrant.createdPath).toBeNull();
      expect(reentrant.deletedFile).toBeNull();
      expect(reentrant.returnValue).toBe('');
    });

    it('runs again at a claimed path once the claim has expired', async () => {
      await testHandleNewNote({
        folders: ['Areas'],
        fileName: 'MyNote',
        userChoice: 'Areas',
        currentFilePath: 'Inbox/MyNote.md'
      });

      // Long after the placement, a note at that path is the user's own doing.
      vi.advanceTimersByTime(2500);

      const later = await testHandleNewNote({
        folders: ['Areas'],
        fileName: 'MyNote',
        userChoice: 'Areas',
        currentFilePath: 'Areas/MyNote.md'
      });

      expect(later.createdPath).toBe('Areas/MyNote.md');
    });

    it('still runs for a genuinely new note at an unrelated path', async () => {
      await testHandleNewNote({
        folders: ['Projekte'],
        fileName: 'First',
        userChoice: 'Projekte',
        currentFilePath: 'Inbox/First.md'
      });

      const second = await testHandleNewNote({
        folders: ['Projekte'],
        fileName: 'Second',
        userChoice: 'Projekte',
        currentFilePath: 'Inbox/Second.md'
      });

      expect(second.createdPath).toBe('Projekte/Second.md');
    });
  });
});
