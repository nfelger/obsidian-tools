import moment from 'moment';

// Vault-relative paths — match DEFAULT_PERIODIC_CONFIG and the fixture
// vault's .obsidian/daily-notes.json, so they hold whether note locations
// resolve from the core Daily Notes plugin or from Bullet Flow's fallback.

export function todayDailyPath(): string {
    return `+Diary/${moment().format('YYYY/MM/YYYY-MM-DD ddd')}.md`;
}

export function tomorrowDailyPath(): string {
    return `+Diary/${moment().add(1, 'day').format('YYYY/MM/YYYY-MM-DD ddd')}.md`;
}

export function thisWeeklyPath(): string {
    return `+Diary/${moment().format('gggg/MM/gggg-MM-[W]WW')}.md`;
}

export const PROJECT_NOTE_PATH = '1 Projekte/My Project.md';
export const AREA_NOTE_PATH = 'Areas/My Area.md';
