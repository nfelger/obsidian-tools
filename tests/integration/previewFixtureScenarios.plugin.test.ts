import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { testCascade, CASCADE_NOTE_PATHS } from '../helpers/cascadePluginTestHelper';
import { isProjectNote } from '../../src/utils/projects';
import { DEFAULT_SETTINGS } from '../../src/types';

/**
 * The preview vault's project scenarios run against the shipped fixture
 * notes, so a fixture the plugin wouldn't treat as a project is caught here
 * rather than in manual testing.
 */
const VAULT = '.devcontainer/vault';

function fixture(name: string): string {
	return readFileSync(join(VAULT, name), 'utf8');
}

function findFixture(dir: string, basename: string): string | null {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith('.')) continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			const found = findFixture(path, basename);
			if (found) return found;
		} else if (entry.name === `${basename}.md`) {
			return relative(VAULT, path);
		}
	}
	return null;
}

function tick(content: string, line: string): string {
	expect(content).toContain(line);
	return content.replace(line, line.replace('- [ ] ', '- [x] '));
}

const projectPath = findFixture(VAULT, 'Preview project');

describe('preview fixture scenarios', () => {
	it('ships the preview project where the default settings look for projects', () => {
		expect(projectPath).not.toBeNull();
		expect(isProjectNote(projectPath!, DEFAULT_SETTINGS)).toBe(true);
	});

	const projectNotes = () => ({ 'Preview project': fixture(projectPath!) });

	it('scenario 3: a project task logs in the project, its child stays out of the daily log', async () => {
		const ticked = '- [ ] [[Preview project]] Draft the rollout plan';
		const result = await testCascade({
			source: tick(fixture('{{weeklyPath}}.md'), ticked),
			sourcePath: CASCADE_NOTE_PATHS.weekly,
			tickedLine: ticked.replace('[ ]', '[x]'),
			projectNotes: projectNotes()
		});

		expect(result.source).toContain('- [<] [[Preview project]] Draft the rollout plan');
		const daily = result.note(CASCADE_NOTE_PATHS.daily)!;
		expect(daily).toContain('- [x] [[Preview project]] Draft the rollout plan');
		expect(daily).not.toContain('Agree on a phased approach');

		const project = result.project('Preview project')!;
		expect(project).toContain('### [[2026-07-02 Thu]]');
		expect(project).toContain('- [x] Draft the rollout plan');
		expect(project).toContain('- [ ] Agree on a phased approach');
		expect(project.split('## Log')[0]).not.toContain('Draft the rollout plan');
	});

	it('scenario 3b: a task under the collector keeps the project prefix and logs in the project', async () => {
		const ticked = '\t- [ ] Book the kickoff room';
		const result = await testCascade({
			source: tick(fixture('{{weeklyPath}}.md'), ticked),
			sourcePath: CASCADE_NOTE_PATHS.weekly,
			tickedLine: ticked.replace('[ ]', '[x]'),
			projectNotes: projectNotes()
		});

		expect(result.source).toContain('- [[Preview project]]\n\t- [<] Book the kickoff room\n\t- [ ] Send the kickoff invite');
		const daily = result.note(CASCADE_NOTE_PATHS.daily)!;
		expect(daily).toContain('- [x] [[Preview project]] Book the kickoff room');
		expect(daily).not.toContain('Ask facilities for the big room');

		const project = result.project('Preview project')!;
		expect(project).toContain('### [[2026-07-02 Thu]]');
		expect(project).toContain('- [x] Book the kickoff room');
		expect(project).toContain('- [ ] Ask facilities for the big room');
	});

	it('scenario 4b: the week\'s aliased copy is merged, not duplicated', async () => {
		const ticked = '- [ ] [[Preview project]] Order the badges';
		const result = await testCascade({
			source: tick(fixture('{{monthlyPath}}.md'), ticked),
			sourcePath: CASCADE_NOTE_PATHS.monthly,
			tickedLine: ticked.replace('[ ]', '[x]'),
			notes: { [CASCADE_NOTE_PATHS.weekly]: fixture('{{weeklyPath}}.md') },
			projectNotes: projectNotes()
		});

		expect(result.source).toContain('- [<] [[Preview project]] Order the badges');

		const week = result.note(CASCADE_NOTE_PATHS.weekly)!;
		expect(week.match(/Order the badges/g)).toHaveLength(1);
		expect(week).toContain('- [<] [[Preview project|preview]] Order the badges');
		expect(week).toContain('- [ ] Pick a badge design');
		expect(week).toContain('- [ ] Attach the guest list');

		const daily = result.note(CASCADE_NOTE_PATHS.daily)!;
		expect(daily).toContain('- [x] [[Preview project]] Order the badges');
		expect(daily).not.toContain('Pick a badge design');
		expect(daily).not.toContain('Attach the guest list');

		const project = result.project('Preview project')!;
		expect(project).toContain('### [[2026-07-02 Thu]]');
		expect(project).toContain('- [x] Order the badges');
		expect(project).toContain('Pick a badge design');
		expect(project).toContain('Attach the guest list');
	});
});
