const DIARY_FOLDER = '+Diary';

// --- Note type detection ---

/**
 * Parse a periodic note filename to determine its type and date info.
 *
 * Filename formats (basename only, without path):
 * - Daily: "YYYY-MM-DD ddd" (e.g., "2026-01-22 Thu")
 * - Weekly: "YYYY-MM-Www" (e.g., "2026-01-W04")
 * - Monthly: "YYYY-MM mmm" (e.g., "2026-01 Jan")
 * - Yearly: "YYYY" (e.g., "2026")
 *
 * @param {string} filename - The note's basename (without .md extension)
 * @returns {object|null} - { type, year, month?, day?, week? } or null if not a periodic note
 */
function parseNoteType(filename) {
  if (!filename) return null;

  // Daily: "YYYY-MM-DD ddd" (e.g., "2026-01-22 Thu")
  const dailyMatch = filename.match(/^(\d{4})-(\d{2})-(\d{2}) [A-Z][a-z]{2}$/);
  if (dailyMatch) {
    return {
      type: 'daily',
      year: parseInt(dailyMatch[1], 10),
      month: parseInt(dailyMatch[2], 10),
      day: parseInt(dailyMatch[3], 10)
    };
  }

  // Weekly: "YYYY-MM-Www" (e.g., "2026-01-W04")
  const weeklyMatch = filename.match(/^(\d{4})-(\d{2})-W(\d{2})$/);
  if (weeklyMatch) {
    return {
      type: 'weekly',
      year: parseInt(weeklyMatch[1], 10),
      month: parseInt(weeklyMatch[2], 10),
      week: parseInt(weeklyMatch[3], 10)
    };
  }

  // Monthly: "YYYY-MM mmm" (e.g., "2026-01 Jan")
  const monthlyMatch = filename.match(/^(\d{4})-(\d{2}) [A-Z][a-z]{2}$/);
  if (monthlyMatch) {
    return {
      type: 'monthly',
      year: parseInt(monthlyMatch[1], 10),
      month: parseInt(monthlyMatch[2], 10)
    };
  }

  // Yearly: "YYYY" (e.g., "2026")
  const yearlyMatch = filename.match(/^(\d{4})$/);
  if (yearlyMatch) {
    return {
      type: 'yearly',
      year: parseInt(yearlyMatch[1], 10)
    };
  }

  return null;
}

/**
 * Check if a date is Sunday (last day of week, since week starts Monday)
 * @param {Date} date
 * @returns {boolean}
 */
function isLastDayOfWeek(date) {
  // Sunday is day 0 in JavaScript, which is the last day of our week (Mon-Sun)
  return date.getDay() === 0;
}

/**
 * Check if a month is December
 * @param {number} month - 1-indexed month (1-12)
 * @returns {boolean}
 */
function isDecember(month) {
  return month === 12;
}

// --- Target note calculation ---

/**
 * Calculate the path to the next periodic note.
 *
 * Full path formats:
 * - Daily: "YYYY/MM/YYYY-MM-DD ddd" (e.g., "2026/01/2026-01-22 Thu")
 * - Weekly: "YYYY/MM/YYYY-MM-Www" (e.g., "2026/01/2026-01-W04")
 * - Monthly: "YYYY/YYYY-MM mmm" (e.g., "2026/2026-01 Jan")
 * - Yearly: "YYYY/YYYY" (e.g., "2026/2026")
 *
 * Boundary rules:
 * - Daily (Sunday) → next Weekly
 * - Weekly → always next Weekly
 * - Monthly (December) → next Yearly
 * - Yearly → always next Yearly
 *
 * @param {object} noteInfo - Result from parseNoteType
 * @param {string} diaryFolder - The diary folder path (default: '+Diary')
 * @returns {string} - Full path to target note (without .md extension)
 */
function getNextNotePath(noteInfo, diaryFolder = DIARY_FOLDER) {
  if (!noteInfo) return '';

  const { type, year, month, day, week } = noteInfo;

  switch (type) {
    case 'daily': {
      const date = new Date(year, month - 1, day);
      if (isLastDayOfWeek(date)) {
        // Sunday → next weekly note
        const nextWeek = getISOWeekNumber(new Date(year, month - 1, day + 1));
        const nextDate = new Date(year, month - 1, day + 1);
        const nextYear = nextDate.getFullYear();
        const nextMonth = String(nextDate.getMonth() + 1).padStart(2, '0');
        return `${diaryFolder}/${nextYear}/${nextMonth}/${nextYear}-${nextMonth}-W${String(nextWeek).padStart(2, '0')}`;
      } else {
        // Normal case → next daily note
        const nextDate = new Date(year, month - 1, day + 1);
        return formatDailyPath(nextDate, diaryFolder);
      }
    }

    case 'weekly': {
      // Always go to next weekly note
      // Calculate the Monday of the next week
      const mondayOfCurrentWeek = getMondayOfISOWeek(year, week);
      const mondayOfNextWeek = new Date(mondayOfCurrentWeek);
      mondayOfNextWeek.setDate(mondayOfNextWeek.getDate() + 7);

      // Use Thursday to determine ISO year and month (Thursday defines which year a week belongs to)
      const thursdayOfNextWeek = new Date(mondayOfNextWeek);
      thursdayOfNextWeek.setDate(thursdayOfNextWeek.getDate() + 3);

      const nextYear = thursdayOfNextWeek.getFullYear();
      const nextMonth = String(thursdayOfNextWeek.getMonth() + 1).padStart(2, '0');
      const nextWeek = getISOWeekNumber(mondayOfNextWeek);
      return `${diaryFolder}/${nextYear}/${nextMonth}/${nextYear}-${nextMonth}-W${String(nextWeek).padStart(2, '0')}`;
    }

    case 'monthly': {
      if (isDecember(month)) {
        // December → next yearly note
        return `${diaryFolder}/${year + 1}/${year + 1}`;
      } else {
        // Normal case → next monthly note
        const nextMonth = month + 1;
        const monthStr = String(nextMonth).padStart(2, '0');
        const monthName = getMonthAbbrev(nextMonth);
        return `${diaryFolder}/${year}/${year}-${monthStr} ${monthName}`;
      }
    }

    case 'yearly': {
      // Always go to next yearly note
      return `${diaryFolder}/${year + 1}/${year + 1}`;
    }

    default:
      return '';
  }
}

// --- Helper functions for date formatting ---

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getWeekdayAbbrev(date) {
  return WEEKDAY_NAMES[date.getDay()];
}

function getMonthAbbrev(month) {
  return MONTH_NAMES[month - 1];
}

function formatDailyPath(date, diaryFolder) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const weekday = getWeekdayAbbrev(date);
  return `${diaryFolder}/${year}/${month}/${year}-${month}-${day} ${weekday}`;
}

/**
 * Get ISO week number for a date.
 * ISO weeks start on Monday and the first week contains Jan 4th.
 */
function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Make Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Set to nearest Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Get the Monday of a given ISO week.
 */
function getMondayOfISOWeek(year, week) {
  // Jan 4 is always in week 1
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7; // Make Sunday = 7
  const mondayOfWeek1 = new Date(jan4);
  mondayOfWeek1.setDate(jan4.getDate() - dayOfWeek + 1);

  // Add (week - 1) * 7 days to get to the target week
  const targetMonday = new Date(mondayOfWeek1);
  targetMonday.setDate(mondayOfWeek1.getDate() + (week - 1) * 7);
  return targetMonday;
}

// --- Task detection ---

/**
 * Check if a line is an incomplete task (starts with "- [ ]")
 * @param {string} line
 * @returns {boolean}
 */
function isIncompleteTask(line) {
  // Match both open tasks [ ] and started tasks [/]
  return /^\s*- \[[ /]\]/.test(line);
}

// --- Main function ---

/**
 * Migrate an incomplete task from the current periodic note to the next note.
 *
 * Behavior:
 * 1. Check cursor is on incomplete task line
 * 2. Determine note type and target note
 * 3. Check target note exists
 * 4. Copy task (and children) to target under "## Log"
 * 5. Mark source task as migrated [>] and remove children
 *
 * @param {object} tp - Templater object
 */
async function migrateTask(tp) {
  try {
    // Get Obsidian app
    const obsidianApp = getObsidianApp(tp);
    const vault = obsidianApp.vault;
    const metadataCache = obsidianApp.metadataCache;

    // Get active editor and file
    const leaf = obsidianApp.workspace.activeLeaf;
    const view = leaf && leaf.view;
    if (!view || view.getViewType() !== 'markdown') {
      showNotice('migrateTask: No active markdown view.');
      return;
    }

    const editor = view.editor;
    const file = view.file;
    if (!file) {
      showNotice('migrateTask: No active file.');
      return;
    }

    // Parse note type first (needed for all paths)
    const noteInfo = parseNoteType(file.basename);
    if (!noteInfo) {
      showNotice('migrateTask: This is not a periodic note.');
      return;
    }

    // Calculate target note path
    const targetPath = getNextNotePath(noteInfo, DIARY_FOLDER) + '.md';

    // Check if target note exists
    const targetFile = vault.getAbstractFileByPath(targetPath);
    if (!targetFile) {
      showNotice(`migrateTask: Target note does not exist: ${targetPath}`);
      return;
    }

    // Get list items metadata
    const fileCache = metadataCache.getFileCache(file);
    const listItems = fileCache && fileCache.listItems;

    // Check for selection vs single cursor
    const from = editor.getCursor('from');
    const to = editor.getCursor('to');
    const hasSelection = from.line !== to.line || from.ch !== to.ch;

    let taskLines;
    if (hasSelection) {
      // Multi-select: find all top-level tasks in range
      const startLine = Math.min(from.line, to.line);
      const endLine = Math.max(from.line, to.line);
      taskLines = findTopLevelTasksInRange(editor, listItems, startLine, endLine);

      if (taskLines.length === 0) {
        showNotice('migrateTask: No incomplete tasks in selection.');
        return;
      }
    } else {
      // Single cursor: use current line
      const currentLine = editor.getCursor().line;
      const lineText = editor.getLine(currentLine);

      if (!isIncompleteTask(lineText)) {
        showNotice('migrateTask: Cursor is not on an incomplete task.');
        return;
      }

      taskLines = [currentLine];
    }

    // Process tasks from bottom to top to preserve line numbers
    taskLines.sort((a, b) => b - a);

    // Collect all content to migrate
    const allContentToMigrate = [];

    for (const taskLine of taskLines) {
      const lineText = editor.getLine(taskLine);
      const children = findChildrenLines(editor, listItems, taskLine);

      // Build content to migrate (parent line + children)
      const parentIndent = countIndent(lineText);
      const parentLineStripped = lineText.slice(parentIndent);
      // Convert started [/] to open [ ] in target
      const parentLineForTarget = parentLineStripped.replace(/^(- )\[\/\]/, '$1[ ]');
      let taskContent = parentLineForTarget;
      if (children && children.lines.length > 0) {
        const dedentedChildren = dedentLinesByAmount(children.lines, parentIndent);
        taskContent += '\n' + dedentedChildren.join('\n');
      }
      allContentToMigrate.push(taskContent);

      // Mark source line as migrated
      const migratedLine = lineText.replace(/^(\s*- )\[[ /]\]/, '$1[>]');
      editor.setLine(taskLine, migratedLine);

      // Remove children from source
      if (children && children.lines.length > 0) {
        editor.replaceRange(
          '',
          { line: children.startLine, ch: 0 },
          { line: children.endLine, ch: 0 }
        );
      }
    }

    // Reverse to restore original order (we processed bottom-to-top)
    allContentToMigrate.reverse();

    // Add all content to target note under ## Log
    await vault.process(targetFile, (data) => {
      let result = data;
      for (const content of allContentToMigrate) {
        result = insertUnderLogHeading(result, content);
      }
      return result;
    });

    const taskCount = taskLines.length;
    const message = taskCount === 1
      ? 'migrateTask: Task migrated successfully.'
      : `migrateTask: ${taskCount} tasks migrated successfully.`;
    showNotice(message);
  } catch (e) {
    showNotice(`migrateTask ERROR: ${e && e.message ? e.message : String(e)}`);
    console.log('migrateTask ERROR', e);
  }
}

// --- Helper functions ---

function showNotice(msg, timeout = 3000) {
  try {
    if (typeof Notice !== 'undefined') {
      new Notice(msg, timeout);
    } else {
      console.log('migrateTask notice:', msg);
    }
  } catch (e) {
    console.log('migrateTask notice error:', e, msg);
  }
}

function getObsidianApp(tp) {
  if (typeof app !== 'undefined') {
    return app;
  }
  if (tp && tp.app) {
    return tp.app;
  }
  throw new Error('Obsidian app object not available');
}

/**
 * Count leading whitespace characters
 */
function countIndent(line) {
  let i = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
    i++;
  }
  return i;
}

/**
 * Remove minimal common indent from all lines
 */
function dedentLines(lines) {
  if (!lines || lines.length === 0) return [];

  let minIndent = null;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const indent = countIndent(line);
    if (minIndent === null || indent < minIndent) {
      minIndent = indent;
    }
  }

  if (minIndent === null || minIndent === 0) {
    return lines.slice();
  }

  return lines.map(line => {
    if (line.trim() === '') return '';
    return line.slice(minIndent);
  });
}

/**
 * Remove a specific amount of indent from all lines
 */
function dedentLinesByAmount(lines, amount) {
  if (!lines || lines.length === 0 || amount <= 0) return lines.slice();

  return lines.map(line => {
    if (line.trim() === '') return '';
    const indent = countIndent(line);
    const toRemove = Math.min(indent, amount);
    return line.slice(toRemove);
  });
}

/**
 * Build a map from line number to list item
 */
function buildLineToItemMap(listItems) {
  const map = new Map();
  if (!listItems) return map;
  for (const li of listItems) {
    if (li.position && li.position.start && typeof li.position.start.line === 'number') {
      map.set(li.position.start.line, li);
    }
  }
  return map;
}

/**
 * Check if an item is a descendant of a given ancestor line
 */
function isDescendantOf(item, ancestorLine, lineToItem) {
  let parentLine = item.parent;
  while (typeof parentLine === 'number' && parentLine >= 0) {
    if (parentLine === ancestorLine) return true;
    const parentItem = lineToItem.get(parentLine);
    if (!parentItem) break;
    parentLine = parentItem.parent;
  }
  return false;
}

/**
 * Find all children lines of a parent line
 */
function findChildrenLines(editor, listItems, parentLine) {
  if (!listItems || listItems.length === 0) return null;

  const lineToItem = buildLineToItemMap(listItems);
  const parentItem = lineToItem.get(parentLine);
  if (!parentItem) return null;

  const childItems = [];
  for (const li of listItems) {
    if (!li.position || !li.position.start) continue;
    const startLine = li.position.start.line;
    if (startLine <= parentLine) continue;
    if (isDescendantOf(li, parentLine, lineToItem)) {
      childItems.push(li);
    }
  }

  if (childItems.length === 0) return null;

  // Find the range of child lines
  let minStart = Infinity;
  let maxEnd = -1;
  for (const ci of childItems) {
    const s = ci.position.start.line;
    const e = ci.position.end.line;
    if (s < minStart) minStart = s;
    if (e > maxEnd) maxEnd = e;
  }

  if (!isFinite(minStart) || maxEnd < minStart) return null;

  const endExclusive = Math.min(maxEnd + 1, editor.lineCount());
  const lines = [];
  for (let i = minStart; i < endExclusive; i++) {
    lines.push(editor.getLine(i));
  }

  return {
    startLine: minStart,
    endLine: endExclusive,
    lines
  };
}

/**
 * Find all top-level incomplete tasks within a line range.
 * "Top-level" means tasks that are not children of other tasks.
 *
 * @param {Object} editor - Editor object with getLine method
 * @param {Array} listItems - List items from metadataCache
 * @param {number} startLine - Start of selection range (inclusive)
 * @param {number} endLine - End of selection range (inclusive)
 * @returns {number[]} - Array of line numbers for top-level incomplete tasks
 */
function findTopLevelTasksInRange(editor, listItems, startLine, endLine) {
  if (!listItems || listItems.length === 0) return [];

  const lineToItem = buildLineToItemMap(listItems);

  // Find all incomplete tasks in the range
  const tasksInRange = [];
  for (const li of listItems) {
    if (!li.position || !li.position.start) continue;
    const line = li.position.start.line;

    // Check if in range
    if (line < startLine || line > endLine) continue;

    // Check if it's an incomplete task
    const lineText = editor.getLine(line);
    if (!isIncompleteTask(lineText)) continue;

    tasksInRange.push({ line, item: li });
  }

  // Filter to only top-level tasks (not children of other tasks)
  const topLevelTasks = [];
  for (const { line, item } of tasksInRange) {
    // A task is top-level if it has no parent, or its parent is not an incomplete task
    // We check if this task is a descendant of any other incomplete task
    let isChild = false;

    // Check if any ancestor is an incomplete task (regardless of whether in selection)
    let parentLine = item.parent;
    while (typeof parentLine === 'number' && parentLine >= 0) {
      const parentText = editor.getLine(parentLine);
      if (isIncompleteTask(parentText)) {
        isChild = true;
        break;
      }
      const parentItem = lineToItem.get(parentLine);
      if (!parentItem) break;
      parentLine = parentItem.parent;
    }

    if (!isChild) {
      topLevelTasks.push(line);
    }
  }

  return topLevelTasks;
}

/**
 * Insert content under ## Log heading, creating it if necessary
 */
function insertUnderLogHeading(content, taskContent) {
  const lines = content.split('\n');

  // Find ## Log heading
  let logLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^## Log\s*$/)) {
      logLineIdx = i;
      break;
    }
  }

  if (logLineIdx >= 0) {
    // Insert after the heading
    lines.splice(logLineIdx + 1, 0, taskContent);
    return lines.join('\n');
  }

  // Need to create ## Log heading
  // Find where to insert (after frontmatter if present)
  let insertIdx = 0;

  // Check for frontmatter
  if (lines[0] === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') {
        insertIdx = i + 1;
        break;
      }
    }
  }

  // Insert ## Log heading and task
  const newContent = ['## Log', taskContent];
  lines.splice(insertIdx, 0, ...newContent);
  return lines.join('\n');
}

// Export main function directly for Templater compatibility
// Attach helpers as properties for testing
module.exports = migrateTask;
module.exports.migrateTask = migrateTask;
module.exports.parseNoteType = parseNoteType;
module.exports.isLastDayOfWeek = isLastDayOfWeek;
module.exports.isDecember = isDecember;
module.exports.getNextNotePath = getNextNotePath;
module.exports.isIncompleteTask = isIncompleteTask;
module.exports.getISOWeekNumber = getISOWeekNumber;
module.exports.getMondayOfISOWeek = getMondayOfISOWeek;
module.exports.formatDailyPath = formatDailyPath;
module.exports.getWeekdayAbbrev = getWeekdayAbbrev;
module.exports.getMonthAbbrev = getMonthAbbrev;
module.exports.countIndent = countIndent;
module.exports.dedentLines = dedentLines;
module.exports.dedentLinesByAmount = dedentLinesByAmount;
module.exports.buildLineToItemMap = buildLineToItemMap;
module.exports.isDescendantOf = isDescendantOf;
module.exports.findChildrenLines = findChildrenLines;
module.exports.findTopLevelTasksInRange = findTopLevelTasksInRange;
module.exports.insertUnderLogHeading = insertUnderLogHeading;
module.exports.DIARY_FOLDER = DIARY_FOLDER;
