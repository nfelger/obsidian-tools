# Domain-Driven Design Architecture Review

**Plugin:** Bullet Flow
**Date:** 2026-01-27
**Reviewer:** Claude (Architecture Analysis)

---

## Executive Summary

Bullet Flow is a well-architected Obsidian plugin with **implicit DDD structure** that could benefit from being made more explicit. The codebase demonstrates good separation of concerns and testability, but several opportunities exist to strengthen domain boundaries and reduce coupling.

**Overall Assessment:** ⭐⭐⭐⭐ (4/5) - Solid foundation with room for DDD refinement

---

## 1. Domain Analysis

### 1.1 Core Domain: BuJo-Style Task Management

The plugin implements a **Bullet Journal workflow** adapted for digital knowledge management. The core problem being solved:

> "Capture everything in daily notes, then migrate/extract lasting content to appropriate locations through intentional review passes."

### 1.2 Identified Bounded Contexts

| Context | Responsibility | Key Files |
|---------|---------------|-----------|
| **Periodic Note Navigation** | Temporal hierarchy, date calculations | `periodicNotes.ts` |
| **Task State Management** | Task lifecycle, deduplication | `tasks.ts`, `config.ts` |
| **Markdown Structure** | List hierarchy, content extraction | `listItems.ts`, `indent.ts` |
| **Knowledge Linking** | Wikilink parsing, file resolution | `wikilinks.ts` |
| **Command Orchestration** | User workflows, UI feedback | `commands/*.ts` |

### 1.3 Domain Entities and Value Objects

#### Entities (with identity)
- **Periodic Note** - A note tied to a specific time period (daily, weekly, monthly, yearly)
- **Task** - A list item with checkbox state that can be migrated

#### Value Objects (defined by attributes)
- **NoteInfo** (`types.ts:43-49`) - Describes a periodic note's type and date components
- **WikiLink** (`types.ts:22-27`) - A resolved reference to another note
- **ChildrenBlock** (`types.ts:14-18`) - A contiguous block of child list items
- **BulletFlowSettings** (`types.ts:69-87`) - Configuration for the domain

#### Domain Events (implicit)
- Task migrated (forward in time)
- Task pushed down (to lower-level note)
- Task pulled up (to higher-level note)
- Content extracted (to linked note)

---

## 2. Current Architecture Strengths

### 2.1 Clear Layering

```
┌─────────────────────────────────────────────┐
│  Application Layer (commands/*.ts)          │ ← Orchestration + UI
├─────────────────────────────────────────────┤
│  Domain Services (utils/*.ts)               │ ← Business logic
├─────────────────────────────────────────────┤
│  Domain Model (types.ts, config.ts)         │ ← Types + Constants
├─────────────────────────────────────────────┤
│  Infrastructure (main.ts, settings.ts)      │ ← Obsidian integration
└─────────────────────────────────────────────┘
```

### 2.2 Testable Pure Functions

Most business logic is in pure functions that don't depend on Obsidian:

```typescript
// Example from tasks.ts - pure, testable
export function extractTaskText(line: string): string {
  const match = line.match(/^\s*- \[.\]\s*(.*)$/);
  return match ? match[1].trim() : '';
}
```

### 2.3 Well-Modeled Periodic Note Hierarchy

The four-level temporal hierarchy (Daily → Weekly → Monthly → Yearly) is explicit and correctly implements:

- ISO 8601 week numbering
- Boundary transitions (Sunday → Weekly, December → Yearly)
- Bidirectional navigation (higher/lower)

### 2.4 Acyclic Dependencies

No circular imports exist. Dependencies flow cleanly:

```
commands → utils → types/config
```

---

## 3. Architecture Issues and Recommendations

### 3.1 Settings Threading Anti-Pattern

**Problem:** Settings are passed through multiple function layers, creating parameter bloat:

```typescript
// Current: settings threaded through every function
parseNoteType(filename, settings)
  → detectNoteType(filename, settings)
    → tryParseWithFormat(filename, format)  // needs settings.dailyNotePattern
```

**Impact:**
- Every function has an extra parameter
- Test fixtures require complete settings objects
- Hard to see which settings each function actually needs

**Recommendation: Introduce PeriodicNoteService**

```typescript
// Proposed: Service encapsulates configuration
export class PeriodicNoteService {
  constructor(private config: PeriodicNoteConfig) {}

  parseNoteType(filename: string): NoteInfo | null { ... }
  getNextNotePath(noteInfo: NoteInfo): string { ... }
  getLowerNotePath(noteInfo: NoteInfo, today: Date): string | null { ... }
  getHigherNotePath(noteInfo: NoteInfo): string | null { ... }
}

// In commands:
const noteService = new PeriodicNoteService(plugin.settings);
const noteInfo = noteService.parseNoteType(file.basename);
```

**Benefits:**
- Configuration injected once at construction
- Methods have cleaner signatures
- Easier to test with mock configurations
- Clear what operations belong together

---

### 3.2 Implicit Task State Machine

**Problem:** Task states and transitions are scattered across config patterns and task functions:

```typescript
// config.ts - states defined as regex patterns
export const INCOMPLETE_TASK_PATTERN = /^\s*- \[[ /]\]/;
export const SCHEDULED_TASK_PATTERN = /^\s*- \[<\]/;
export const MIGRATED_MARKER = '[>]';

// tasks.ts - transitions as string manipulation
export function markTaskAsScheduled(line: string): string { ... }
export function markScheduledAsOpen(line: string): string { ... }
```

The actual state machine is implicit:

```
[ ] (Open)  ─┬─ migrateTask ─→ [>] (Migrated) [terminal]
[/] (Started)│
             ├─ pushDown/pullUp ─→ [<] (Scheduled) ─┬─ merge ─→ [ ] (Open)
             │                                      └─ (wait)
             └─ complete ─→ [x] (Completed) [terminal]
```

**Recommendation: Explicit TaskState Value Object**

```typescript
// Proposed: Explicit state machine
export enum TaskState {
  Open = ' ',
  Started = '/',
  Completed = 'x',
  Migrated = '>',
  Scheduled = '<',
}

export class TaskMarker {
  constructor(public readonly state: TaskState) {}

  static fromLine(line: string): TaskMarker | null { ... }

  canMigrate(): boolean {
    return this.state === TaskState.Open || this.state === TaskState.Started;
  }

  canReopen(): boolean {
    return this.state === TaskState.Scheduled;
  }

  toMigrated(): TaskMarker { return new TaskMarker(TaskState.Migrated); }
  toScheduled(): TaskMarker { return new TaskMarker(TaskState.Scheduled); }
  toOpen(): TaskMarker { return new TaskMarker(TaskState.Open); }

  render(): string { return `[${this.state}]`; }
}
```

**Benefits:**
- Invalid state transitions become impossible
- Self-documenting state machine
- Easier to extend with new states
- Central place for state logic

---

### 3.3 Infrastructure Leakage into Domain

**Problem:** Some domain functions directly depend on Obsidian types:

```typescript
// wikilinks.ts - MetadataCache is Obsidian infrastructure
export function findFirstWikiLink(
  lineText: string,
  sourcePath: string,
  metadataCache: MetadataCache  // ← Obsidian API
): WikiLink | null { ... }

// WikiLink type includes TFile (Obsidian type)
export interface WikiLink {
  tfile: TFile;  // ← Obsidian type in domain model
  // ...
}
```

**Recommendation: Domain/Infrastructure Separation**

```typescript
// Domain layer - pure types
export interface ResolvedLink {
  path: string;
  exists: boolean;
  index: number;
  matchText: string;
  inner: string;
}

// Infrastructure adapter
export interface LinkResolver {
  resolve(linkPath: string, sourcePath: string): ResolvedLink | null;
}

// Obsidian implementation (in infrastructure)
export class ObsidianLinkResolver implements LinkResolver {
  constructor(private metadataCache: MetadataCache, private vault: Vault) {}

  resolve(linkPath: string, sourcePath: string): ResolvedLink | null {
    const tfile = this.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
    if (!tfile) return null;
    return { path: tfile.path, exists: true, ... };
  }
}
```

**Benefits:**
- Domain logic testable without Obsidian mocks
- Clear infrastructure boundary
- Easier to adapt to other platforms (if ever needed)

---

### 3.4 Mixed Concerns in Commands

**Problem:** Commands mix orchestration with UI feedback:

```typescript
// pushTaskDown.ts - business logic interleaved with UI
export async function pushTaskDown(plugin: BulletFlowPlugin): Promise<void> {
  // ... business logic ...
  new Notice('pushTaskDown: Task merged with existing in lower note.');  // UI
  // ... more business logic ...
  new Notice(`pushTaskDown ERROR: ${e.message}`);  // UI
}
```

**Recommendation: Separate Command Results from UI**

```typescript
// Domain result type
export interface TaskTransferResult {
  success: boolean;
  tasksProcessed: number;
  tasksMerged: number;
  tasksNew: number;
  error?: string;
}

// Pure business logic (testable)
export class TaskTransferService {
  async pushTaskDown(
    source: NoteInfo,
    targetPath: string,
    tasks: TaskSelection
  ): Promise<TaskTransferResult> {
    // Pure orchestration, no UI
  }
}

// Command handles UI (thin wrapper)
export async function pushTaskDown(plugin: BulletFlowPlugin): Promise<void> {
  const result = await plugin.taskTransferService.pushTaskDown(...);

  if (result.success) {
    const msg = formatSuccessMessage(result);
    new Notice(msg);
  } else {
    new Notice(`pushTaskDown ERROR: ${result.error}`, NOTICE_TIMEOUT_ERROR);
  }
}
```

**Benefits:**
- Business logic fully testable without UI mocking
- Commands become thin adapters
- Result type documents all possible outcomes
- Easier to reuse logic (e.g., bulk operations, API exposure)

---

### 3.5 Suggested Module Reorganization

Current structure is functional but could better express bounded contexts:

```
src/
├── main.ts
├── settings.ts
├── types.ts                    # All types mixed
├── config.ts                   # Constants
├── commands/
│   ├── extractLog.ts
│   ├── migrateTask.ts
│   ├── pushTaskDown.ts
│   └── pullUp.ts
└── utils/
    ├── commandSetup.ts
    ├── indent.ts
    ├── listItems.ts
    ├── periodicNotes.ts
    ├── tasks.ts
    └── wikilinks.ts
```

**Proposed DDD-aligned structure:**

```
src/
├── main.ts                          # Plugin entry
├── settings.ts                      # Settings UI
│
├── domain/                          # Core domain model
│   ├── types.ts                     # All domain types
│   ├── periodic-notes/
│   │   ├── NoteInfo.ts              # Value object
│   │   ├── PeriodicNoteService.ts   # Domain service
│   │   └── dateUtils.ts             # Pure date functions
│   ├── tasks/
│   │   ├── TaskState.ts             # State machine
│   │   ├── TaskDeduplication.ts     # Dedup algorithm
│   │   └── taskUtils.ts             # Pure helpers
│   └── markdown/
│       ├── ListItem.ts              # Value object
│       ├── WikiLink.ts              # Value object
│       └── markdownUtils.ts         # Pure helpers
│
├── application/                     # Application services
│   ├── ExtractLogService.ts
│   ├── MigrateTaskService.ts
│   └── TaskTransferService.ts       # Shared pushDown/pullUp
│
├── infrastructure/                  # Obsidian adapters
│   ├── ObsidianLinkResolver.ts
│   ├── ObsidianEditor.ts
│   └── commandSetup.ts
│
└── commands/                        # Thin UI wrappers
    ├── extractLog.ts
    ├── migrateTask.ts
    ├── pushTaskDown.ts
    └── pullUp.ts
```

**Trade-off:** This adds complexity. For a plugin this size, the current flat structure may be acceptable. Consider this reorganization only if:
- The plugin grows significantly
- Multiple developers contribute
- You want to expose domain logic as a library

---

## 4. Prioritized Recommendations

### High Impact, Low Effort

1. **Extract PeriodicNoteService** - Encapsulate settings dependency
   - Improves testability
   - Clarifies API surface
   - ~2 hours refactoring

2. **Make TaskState explicit** - Enum + value object
   - Documents state machine
   - Prevents invalid transitions
   - ~1 hour refactoring

### Medium Impact, Medium Effort

3. **Separate command results from UI** - Return result types
   - Enables testing without UI mocks
   - Makes outcomes explicit
   - ~3 hours per command

4. **Abstract LinkResolver interface** - Domain/infrastructure boundary
   - Cleaner domain model
   - Easier testing
   - ~2 hours refactoring

### Lower Priority (consider for growth)

5. **Reorganize into bounded context folders** - Only if plugin grows
6. **Add domain events** - If you need cross-context communication
7. **Introduce repository pattern** - If file operations become complex

---

## 5. What NOT to Change

Some current patterns are **good pragmatic choices** that shouldn't be "fixed":

1. **Using moment.js from Obsidian** - Leverages framework, no extra dependencies
2. **Flat utils folder** - Appropriate for current codebase size
3. **Plugin instance passed to commands** - Practical access to app/settings
4. **Test helpers per command** - Good test isolation pattern

---

## 6. Summary

| Aspect | Current State | Recommendation |
|--------|---------------|----------------|
| **Bounded Contexts** | Implicit | Document explicitly, consider folders if growing |
| **Domain Model** | Good types, scattered | Extract services, explicit state machine |
| **Dependencies** | Clean acyclic | Reduce settings threading |
| **Infrastructure** | Partially leaked | Abstract behind interfaces |
| **Testability** | Good | Improve by separating UI from logic |
| **Code Organization** | Functional | Good for size, reorganize if growing |

The Bullet Flow codebase is well-designed for its current scope. The recommendations here are improvements, not fixes for broken architecture. Prioritize based on pain points you actually experience rather than theoretical purity.
