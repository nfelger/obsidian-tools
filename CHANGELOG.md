# Changelog

All notable changes to Bullet Flow are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-01-25

### Added

**Slice 7: Polish & UX**
- Inject custom checkbox CSS directly in plugin (no manual snippet installation needed)
- Custom `[o]` marker for meetings with red calendar icon

**Slice 6: Complete migrateTask Implementation**
- Full periodic note support (weekly, monthly, yearly)
- Boundary transitions (Sunday → weekly, December → yearly)
- Multi-select task migration
- ISO week number calculations
- Ported all 46 legacy unit tests for periodic notes
- Ported all 18 legacy integration tests
- Mobile-friendly selection detection using `editor.listSelections()`

**Slice 5: migrateTask MVP**
- Daily note migration command
- Task marking (`[ ]` → `[>]`)
- Child task handling with proper indentation
- Automatic next note path calculation
- Created `tasks.ts` utility
- Created `periodicNotes.ts` utility
- Ported 25 unit tests from legacy script

**Slice 4: Complete extractLog Implementation**
- Section link support (`[[Note#Section]]`)
- Pure link bullet detection and parent context inheritance
- Comprehensive edge case handling
- Full test suite ported (71 unit + 10 integration tests)
- Clipboard integration
- Back-link generation with timestamps

**Slice 3: extractLog MVP**
- Basic extraction from daily notes to target notes
- Wikilink parsing (`[[Note]]`, `[[Note|alias]]`)
- `## Log` section management
- Child content preservation
- Created `wikilinks.ts` utility
- Created `indent.ts` utility
- Created `listItems.ts` utility

**Slice 2: BRAT Walking Skeleton**
- GitHub Actions workflow for auto-deploy
- Semantic versioning with dev releases
- BRAT installation support
- Every push creates new release automatically

**Slice 1: Hello Plugin**
- TypeScript plugin scaffold
- esbuild build pipeline
- Obsidian API integration
- Plugin loads on mobile and desktop
- Test command for verification

### Changed
- Migrated from Templater user scripts to native Obsidian plugin
- Module system: CommonJS → ES6 modules with TypeScript
- File organization: Single files → Multi-file structure
- Distribution: Manual copying → BRAT auto-update
- CSS injection: Manual snippet → Automatic plugin injection

### Migration Notes

**From v0.1.0 (Templater Scripts):**

The plugin maintains full feature parity with the original Templater scripts while adding:
- Automatic updates via BRAT
- No manual file copying required
- Custom CSS injected automatically
- Better mobile selection handling
- Full TypeScript type safety
- 291 comprehensive tests

**Legacy scripts** in `scripts/` folder are kept as reference but are no longer needed.

## [0.1.0] - 2026-01-23

### Added
- Initial Templater user scripts implementation
- `extractLog.js` - Extract nested content from daily notes
- `migrateTask.js` - BuJo-style task migration
- `handleNewNote.js` - Folder selection for new notes
- Comprehensive test suite with Vitest
- 75%+ code coverage
- Obsidian API mocks
- Markdown-first testing pattern

---

## Version History

- **0.2.0** - Native Obsidian plugin with auto-deploy (current)
- **0.1.0** - Templater user scripts (legacy)
