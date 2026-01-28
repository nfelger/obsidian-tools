/**
 * Test helper for handleNewNote integration tests
 *
 * Provides a clean API for testing UI workflow scripts that don't
 * transform markdown, but orchestrate file operations and user interactions.
 */

import { vi } from 'vitest';
import {
  createMockApp,
  createMockFile,
  createMockVault,
  createMockWorkspace,
  createMockTp
} from '../mocks/obsidian.js';

const handleNewNote = require('../../scripts/handleNewNote.js');

/**
 * Test handleNewNote with a clean, readable API
 *
 * @param {Object} options
 * @param {string[]} options.folders - Array of folder paths in the vault
 * @param {string} options.fileName - Name of the note being created
 * @param {string|null} options.userChoice - Folder user selects, or null to cancel
 * @param {string} options.currentFilePath - Path of temporary file to delete
 * @returns {Promise<Object>} Result object with test assertions
 */
export async function testHandleNewNote({
  folders = [],
  fileName = 'Test',
  userChoice = null,
  currentFilePath = 'temp.md'
}) {
  // Convert folder strings to folder objects
  const folderObjects = folders.map(path => ({ path }));

  // Track state for assertions
  const state = {
    displayedFolders: [],
    displayedValues: [],
    createdPath: null,
    deletedFile: null,
    openedFile: null,
    cancelled: userChoice === null
  };

  // Set up vault mock
  const mockVault = createMockVault();
  mockVault.getAllFolders = vi.fn(() => folderObjects);
  mockVault.delete = vi.fn((file) => {
    state.deletedFile = file.path;
  });
  mockVault.create = vi.fn((path, content) => {
    state.createdPath = path;
    return createMockFile({ path });
  });

  // Set up workspace mock
  const openFileMock = vi.fn((file) => {
    state.openedFile = file.path;
  });
  const mockWorkspace = createMockWorkspace();
  mockWorkspace.getLeaf = vi.fn(() => ({ openFile: openFileMock }));

  // Set up app mock
  const mockApp = createMockApp({ vault: mockVault, workspace: mockWorkspace });
  vi.stubGlobal('app', mockApp);

  // Set up tp mock
  const mockTp = createMockTp({ app: mockApp });
  mockTp.file = { title: fileName };
  mockTp.config = { target_file: createMockFile({ path: currentFilePath }) };
  mockTp.system.suggester = vi.fn(async (display, values) => {
    // Capture what was shown to user
    state.displayedFolders = [...display];
    state.displayedValues = [...values];
    return userChoice;
  });

  // Execute the script
  const result = await handleNewNote(mockTp);

  return {
    // What user saw in the picker
    displayedFolders: state.displayedFolders,
    displayedValues: state.displayedValues,

    // File operations performed
    createdPath: state.createdPath,
    deletedFile: state.deletedFile,
    openedFile: state.openedFile,

    // User interaction
    cancelled: state.cancelled,

    // Return value
    returnValue: result
  };
}
