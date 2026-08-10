import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testHandleNewNote } from './handleNewNoteTestHelper.js';

describe('handleNewNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('Notice', vi.fn());
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

    it('moves note to root when root is chosen', async () => {
      const result = await testHandleNewNote({
        folders: ['folder1'],
        fileName: 'MyNote',
        userChoice: '/'
      });

      expect(result.movedTo).toBe('MyNote.md');
    });
  });

  describe('note placement', () => {
    it('moves note to chosen subfolder', async () => {
      const result = await testHandleNewNote({
        folders: ['Projects', 'Areas'],
        fileName: 'MyNote',
        userChoice: 'Projects'
      });

      expect(result.movedTo).toBe('Projects/MyNote.md');
    });

    it('renames the note rather than recreating it', async () => {
      const result = await testHandleNewNote({
        folders: ['folder'],
        fileName: 'MyNote',
        userChoice: 'folder',
        currentFilePath: 'Inbox/MyNote.md'
      });

      // A delete leaves a path that a pending editor save can resurrect;
      // a rename carries the file, and any queued write, to the new path.
      expect(result.deletedFile).toBeNull();
      expect(result.createdPath).toBeNull();
      expect(result.movedTo).toBe('folder/MyNote.md');
    });

    it('opens the moved note', async () => {
      const result = await testHandleNewNote({
        folders: ['folder'],
        fileName: 'MyNote',
        userChoice: 'folder'
      });

      expect(result.openedFile).toBe('folder/MyNote.md');
    });
  });

  describe('destination folder template', () => {
    it('applies the destination folder template to the moved note', async () => {
      const result = await testHandleNewNote({
        folders: ['1 Projekte'],
        fileName: 'MyNote',
        userChoice: '1 Projekte',
        folderTemplate: 'Templates/Projekt.md'
      });

      // A rename fires no create event, so Templater never applies this
      // itself — the script has to ask for it.
      expect(result.appliedTemplate).toBe('Templates/Projekt.md');
      expect(result.templatedFile).toBe('1 Projekte/MyNote.md');
    });

    it('applies the template only after the note has moved', async () => {
      const result = await testHandleNewNote({
        folders: ['1 Projekte'],
        fileName: 'MyNote',
        userChoice: '1 Projekte',
        folderTemplate: 'Templates/Projekt.md'
      });

      expect(result.operations).toEqual(['rename', 'open', 'template']);
    });

    it('applies nothing when the destination folder has no template', async () => {
      const result = await testHandleNewNote({
        folders: ['2 Areas'],
        fileName: 'MyNote',
        userChoice: '2 Areas',
        folderTemplate: null
      });

      expect(result.appliedTemplate).toBeNull();
      expect(result.movedTo).toBe('2 Areas/MyNote.md');
    });

    it('refuses to re-apply the template it is running inside', async () => {
      const result = await testHandleNewNote({
        folders: ['Inbox'],
        fileName: 'MyNote',
        userChoice: 'Inbox',
        runningTemplate: 'Templates/New Note.md',
        folderTemplate: 'Templates/New Note.md'
      });

      // Filing back into the folder that started the flow would otherwise
      // re-run this script against the note it just moved, forever.
      expect(result.appliedTemplate).toBeNull();
      expect(result.movedTo).toBe('Inbox/MyNote.md');
    });

    it('still files the note when Templater internals are unavailable', async () => {
      const result = await testHandleNewNote({
        folders: ['1 Projekte'],
        fileName: 'MyNote',
        userChoice: '1 Projekte',
        folderTemplate: 'Templates/Projekt.md',
        templaterAvailable: false
      });

      expect(result.movedTo).toBe('1 Projekte/MyNote.md');
      expect(result.appliedTemplate).toBeNull();
    });

    it('says so when the templating could not be applied', async () => {
      await testHandleNewNote({
        folders: ['1 Projekte'],
        fileName: 'MyNote',
        userChoice: '1 Projekte',
        folderTemplate: 'Templates/Projekt.md',
        templaterAvailable: false
      });

      // Silence here means untemplated project notes going unnoticed.
      expect(Notice).toHaveBeenCalledWith(expect.stringContaining('could not be applied'));
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
      expect(result.movedTo).toBeNull();
    });
  });

});
