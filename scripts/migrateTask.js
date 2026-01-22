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

      const nextYear = mondayOfNextWeek.getFullYear();
      const nextMonth = String(mondayOfNextWeek.getMonth() + 1).padStart(2, '0');
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
  return /^\s*- \[ \]/.test(line);
}

// --- Main function ---

/**
 * Migrate an incomplete task from the current periodic note to the next note.
 *
 * Behavior:
 * 1. Check cursor is on incomplete task line
 * 2. Determine note type and target note
 * 3. Check target note exists
 * 4. Copy task (and children) to target under "## Migrated"
 * 5. Mark source task as migrated [>] and remove children
 *
 * @param {object} tp - Templater object
 */
async function migrateTask(tp) {
  // TODO: Implement
}

module.exports = {
  migrateTask,
  parseNoteType,
  isLastDayOfWeek,
  isDecember,
  getNextNotePath,
  isIncompleteTask,
  getISOWeekNumber,
  getMondayOfISOWeek,
  formatDailyPath,
  getWeekdayAbbrev,
  getMonthAbbrev,
  DIARY_FOLDER
};
