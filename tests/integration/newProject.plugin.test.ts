import { describe, it, expect, vi, beforeEach } from 'vitest';
import { newProject } from '../../src/commands/newProject';
import { NewProjectModal } from '../../src/adapters/newProjectPrompt';
import { DEFAULT_SETTINGS } from '../../src/types';
import { isProjectNote } from '../../src/utils/projects';
import { createMemoryVault } from '../helpers/memoryVault';
import { createMockApp, createMockFile } from '../mocks/obsidian.js';
import type { NewProjectInput } from '../../src/types';

const notices: string[] = [];
vi.mock('obsidian', async () => {
	const actual: any = await vi.importActual('../mocks/obsidian.js');
	return {
		...actual,
		Notice: class { constructor(message: string) { notices.push(message); } }
	};
});

/** Minimal YAML frontmatter: `key: value` and `key:` with `  - item` lists. */
function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
	if (!match) return { data: {}, body: content };
	const data: Record<string, unknown> = {};
	let listKey: string | null = null;
	for (const line of match[1].split('\n')) {
		const item = line.match(/^\s+- (.*)$/);
		if (item && listKey) { (data[listKey] as string[]).push(item[1]); continue; }
		const [key, ...rest] = line.split(':');
		const value = rest.join(':').trim();
		if (value) { data[key] = value; listKey = null; } else { data[key] = []; listKey = key; }
	}
	return { data, body: content.slice(match[0].length) };
}

function renderFrontmatter(data: Record<string, unknown>, body: string): string {
	const lines = Object.entries(data).map(([key, value]) =>
		Array.isArray(value) ? `${key}:\n${value.map(v => `  - ${v}`).join('\n')}` : `${key}: ${value}`
	);
	return `---\n${lines.join('\n')}\n---\n${body}`;
}

interface Setup {
	files?: Record<string, string>;
	input?: NewProjectInput | null;
	/** Drives the form instead of answering with `input` directly. */
	prompt?: () => Promise<NewProjectInput | null>;
	activeNote?: { path: string; content: string; cursor: { line: number; ch: number }; selectionEnd?: { line: number; ch: number } } | null;
	templater?: { templateFor?: (folder: string) => string | null; broken?: boolean; triggerOnCreate?: boolean };
}

async function run(setup: Setup) {
	notices.length = 0;
	const memory = createMemoryVault(setup.files ?? {});
	const { vault, contents } = memory;
	const folders = new Set<string>();
	vault.createFolder = vi.fn(async (path: string) => { folders.add(path); });
	const baseGet = vault.getAbstractFileByPath;
	vault.getAbstractFileByPath = vi.fn((path: string) =>
		baseGet(path) ?? (folders.has(path) ? { path, children: [] } : null)
	);
	vault.getRoot = vi.fn(() => ({ path: '/', children: [] }));

	let templateRuns = 0;
	const applyTemplate = async (templatePath: string, file: any) => {
		templateRuns++;
		contents.set(file.path, contents.get(templatePath) ?? '');
	};
	const templater = setup.templater;
	const resolveTemplate = (folder: any) => templater?.templateFor?.(folder.path) ?? null;
	const baseCreate = vault.create;
	vault.create = vi.fn(async (path: string, content: string) => {
		const file = await baseCreate(path, content);
		// Templater's "Trigger on new file creation" templates notes created empty
		if (templater?.triggerOnCreate && content === '') {
			const template = resolveTemplate({ path: path.split('/').slice(0, -1).join('/') });
			if (template) await applyTemplate(template, file);
		}
		return file;
	});

	let lines = setup.activeNote ? setup.activeNote.content.split('\n') : [];
	let selection = setup.activeNote ? { from: setup.activeNote.cursor, to: setup.activeNote.selectionEnd ?? setup.activeNote.cursor } : null;
	const editor = setup.activeNote ? {
		getCursor: vi.fn((which: string) => (which === 'to' ? selection!.to : selection!.from)),
		setSelection: vi.fn((from: any, to: any) => { selection = { from, to }; }),
		replaceSelection: vi.fn((text: string) => {
			const { from, to } = selection!;
			const before = lines[from.line].slice(0, from.ch);
			const after = lines[to.line].slice(to.ch);
			lines.splice(from.line, to.line - from.line + 1, before + text + after);
		})
	} : null;

	const app: any = createMockApp({ vault });
	app.workspace.getActiveViewOfType = vi.fn(() =>
		editor ? { editor, file: createMockFile({ path: setup.activeNote!.path }) } : null
	);
	app.workspace.getLeaf = vi.fn();
	app.metadataCache.fileToLinktext = vi.fn((file: any) => file.basename);
	app.fileManager = {
		processFrontMatter: vi.fn(async (file: any, fn: (fm: Record<string, unknown>) => void) => {
			const { data, body } = parseFrontmatter(contents.get(file.path) ?? '');
			fn(data);
			contents.set(file.path, renderFrontmatter(data, body));
		})
	};
	if (templater) {
		app.plugins = {
			plugins: {
				'templater-obsidian': {
					templater: templater.broken ? {} : {
						get_new_file_template_for_folder: vi.fn(resolveTemplate),
						write_template_to_file: vi.fn(async (templateFile: any, file: any) => applyTemplate(templateFile.path, file))
					}
				}
			}
		};
	}

	const plugin: any = { app, settings: { ...DEFAULT_SETTINGS } };
	await newProject(plugin, setup.prompt ?? (async () => setup.input ?? null));
	return { contents, lines, notices: [...notices], templateRuns, app, folders };
}

const DAILY = { path: '+Diary/2026/11/2026-11-25 Wed.md', content: '## Log\n- Kickoff with design about ', cursor: { line: 1, ch: 28 } };
const TEMPLATE = `---
tags: project
---
## Todo

## Log
`;

describe('New project', () => {
	beforeEach(() => vi.clearAllMocks());

	it('A: creates the note with its alias and links it at the cursor without opening it', async () => {
		const r = await run({ input: { name: ' Website Relaunch ', alias: ' relaunch ' }, activeNote: DAILY });

		expect(r.contents.get('1 Projekte/Website Relaunch.md')).toBe(`---
aliases:
  - relaunch
---
`);
		expect(r.lines[1]).toBe('- Kickoff with design about [[Website Relaunch|relaunch]]');
		expect(r.folders.has('1 Projekte')).toBe(true);
		expect(r.app.workspace.getLeaf).not.toHaveBeenCalled();
		expect(r.notices).toEqual(['New project: created Website Relaunch.']);
	});

	it('replaces selected text with the link', async () => {
		const r = await run({
			input: { name: 'Website Relaunch', alias: 'relaunch' },
			activeNote: { path: 'n.md', content: '- about the relaunch thing', cursor: { line: 0, ch: 12 }, selectionEnd: { line: 0, ch: 26 } },
		});
		expect(r.lines[0]).toBe('- about the [[Website Relaunch|relaunch]]');
	});

	it('B: a blank alias inserts a plain link and adds no aliases key', async () => {
		const r = await run({ input: { name: 'Website Relaunch', alias: '  ' }, activeNote: DAILY });

		expect(r.contents.get('1 Projekte/Website Relaunch.md')).toBe('');
		expect(r.lines[1]).toBe('- Kickoff with design about [[Website Relaunch]]');
	});

	it('an alias equal to the name is treated as no alias', async () => {
		const r = await run({ input: { name: 'Website Relaunch', alias: 'Website Relaunch' }, activeNote: DAILY });
		expect(r.lines[1]).toBe('- Kickoff with design about [[Website Relaunch]]');
		expect(r.contents.get('1 Projekte/Website Relaunch.md')).toBe('');
	});

	it.each([false, true])('C: applies a parent-folder Templater template exactly once (trigger on create: %s)', async triggerOnCreate => {
		const r = await run({
			files: { 'Templates/Project.md': TEMPLATE },
			input: { name: 'Website Relaunch', alias: 'relaunch' },
			activeNote: DAILY,
			templater: { triggerOnCreate, templateFor: folder => (folder === '' || folder === '/' || folder === '1 Projekte' ? 'Templates/Project.md' : null) },
		});

		expect(r.templateRuns).toBe(1);
		expect(r.contents.get('1 Projekte/Website Relaunch.md')).toBe(`---
tags: project
aliases:
  - relaunch
---
## Todo

## Log
`);
		expect(r.lines[1]).toBe('- Kickoff with design about [[Website Relaunch|relaunch]]');
	});

	it('D: with Templater but no matching template the note holds only the alias', async () => {
		const r = await run({
			input: { name: 'Website Relaunch', alias: 'relaunch' },
			activeNote: DAILY,
			templater: { triggerOnCreate: true, templateFor: () => null },
		});
		expect(r.templateRuns).toBe(0);
		expect(r.contents.get('1 Projekte/Website Relaunch.md')).toBe('---\naliases:\n  - relaunch\n---\n');
	});

	it('creates the note and says so when Templater\'s folder-template API is missing', async () => {
		const r = await run({ input: { name: 'Website Relaunch', alias: '' }, activeNote: DAILY, templater: { broken: true } });
		expect(r.contents.has('1 Projekte/Website Relaunch.md')).toBe(true);
		expect(r.notices[0]).toContain("Templater's folder template could not be applied");
	});

	it('E: dismissing the form creates and inserts nothing', async () => {
		const r = await run({ input: null, activeNote: DAILY });
		expect([...r.contents.keys()]).toEqual([]);
		expect(r.lines[1]).toBe('- Kickoff with design about ');
		expect(r.notices).toEqual([]);
	});

	it('F: an existing project note is left untouched and nothing is linked', async () => {
		const existing = '## Todo\n- [ ] Keep me\n';
		const r = await run({
			files: { '1 Projekte/Website Relaunch.md': existing },
			input: { name: 'Website Relaunch', alias: 'relaunch' },
			activeNote: DAILY,
		});
		expect(r.contents.get('1 Projekte/Website Relaunch.md')).toBe(existing);
		expect(r.lines[1]).toBe('- Kickoff with design about ');
		expect(r.notices[0]).toContain('Website Relaunch already exists');
		expect(r.notices[0]).toContain('nothing was created or linked');
	});

	it('G: a name with filename-invalid characters creates and inserts nothing', async () => {
		const r = await run({ input: { name: 'A/B', alias: '' }, activeNote: DAILY });
		expect([...r.contents.keys()]).toEqual([]);
		expect(r.lines[1]).toBe('- Kickoff with design about ');
		expect(r.notices[0]).toContain('"A/B"');
	});

	it('H: without an active note the project is still created', async () => {
		const r = await run({ input: { name: 'Website Relaunch', alias: 'relaunch' }, activeNote: null });
		expect(r.contents.has('1 Projekte/Website Relaunch.md')).toBe(true);
		expect(r.notices[0]).toContain('no link inserted');
	});

	it('J: the created note counts as a project note', async () => {
		const r = await run({ input: { name: 'Website Relaunch', alias: 'relaunch' }, activeNote: DAILY });
		const [path] = [...r.contents.keys()];
		expect(isProjectNote(path, DEFAULT_SETTINGS)).toBe(true);
	});
});

/** Every element rendered under `el`, depth first. */
function descendants(el: any): any[] {
	return el.children.flatMap((child: any) => [child, ...descendants(child)]);
}

function openForm(isTaken?: (name: string) => boolean) {
	const modal = new NewProjectModal({} as any, isTaken);
	const answer = modal.ask();
	const all = descendants(modal.contentEl);
	const button = (text: string) => all.find(e => e.tagName === 'button' && e.textContent === text);
	const error = all.find(e => e.cls === 'new-project-error');
	return { modal, answer, all, button, error, name: modal.nameInput as any, alias: modal.aliasInput as any };
}

const enter = () => ({ type: 'keydown', key: 'Enter', isComposing: false, preventDefault: vi.fn() });
const typeInto = (input: any, value: string) => {
	input.value = value;
	input.dispatchEvent({ type: 'input' });
};

describe('New project form', () => {
	it('I: opens with an empty, focused full-name field', () => {
		const { name } = openForm();
		expect(name.value).toBe('');
		expect(name.focus).toHaveBeenCalled();
	});

	it('K: shows a title, stacked labelled fields, alias help and both buttons', () => {
		const { modal, all, button, name, alias } = openForm();
		expect(modal.titleEl.setText).toHaveBeenCalledWith('New project');

		const labels = all.filter(e => e.tagName === 'label');
		const inputs = all.filter(e => e.tagName === 'input');
		expect(labels.map(l => l.textContent)).toEqual(['Project name', 'Alias']);
		expect(inputs).toEqual([name, alias]);
		expect(labels[0].attrs.for).toBe(name.attrs.id);
		expect(labels[1].attrs.for).toBe(alias.attrs.id);
		expect(name.attrs.id).not.toBe(alias.attrs.id);
		expect(inputs.every(i => i.attrs.type === 'text')).toBe(true);
		expect(name.attrs.placeholder).toBe('Migration Initiative');
		expect(alias.attrs.placeholder).toBe('migration');

		// Each field is its own block, so label, input and help stack vertically
		const fields = modal.contentEl.children.filter((e: any) => e.cls === 'new-project-field');
		expect(fields).toHaveLength(2);
		expect(fields[0].children).toContain(name);
		expect(fields[1].children).toContain(alias);
		const help = fields[1].children.find((e: any) => e.cls === 'new-project-description');
		expect(help.textContent).toBe('Shown in the link. Optional.');

		const buttons = all.filter(e => e.tagName === 'button');
		expect(buttons.map(b => b.textContent)).toEqual(['Cancel', 'Create']);
		expect(button('Create').cls).toBe('mod-cta');
		const footer = modal.contentEl.children.at(-1);
		expect(footer.cls).toBe('modal-button-container');
		expect(footer.children).toEqual(buttons);
		expect(name.focus).toHaveBeenCalled();
	});

	it('L: clicking Create project submits the trimmed fields', async () => {
		const { answer, button, name, alias } = openForm();
		name.value = ' Website Relaunch ';
		alias.value = ' relaunch ';
		button('Create').dispatchEvent({ type: 'click' });
		expect(await answer).toEqual({ name: 'Website Relaunch', alias: 'relaunch' });
	});

	it('L: a clicked submission creates and links the project like case A', async () => {
		const r = await run({
			activeNote: DAILY,
			prompt: () => {
				const { answer, button, name, alias } = openForm();
				name.value = 'Website Relaunch';
				alias.value = 'relaunch';
				button('Create').dispatchEvent({ type: 'click' });
				return answer;
			},
		});
		expect(r.contents.has('1 Projekte/Website Relaunch.md')).toBe(true);
		expect(r.lines[1]).toBe('- Kickoff with design about [[Website Relaunch|relaunch]]');
	});

	it('M: Enter in the alias field submits', async () => {
		const { answer, name, alias } = openForm();
		name.value = 'Website Relaunch';
		alias.value = 'relaunch';
		const evt = enter();
		alias.dispatchEvent(evt);
		expect(evt.preventDefault).toHaveBeenCalled();
		expect(await answer).toEqual({ name: 'Website Relaunch', alias: 'relaunch' });
	});

	it('M: Enter in the name field submits with an empty alias, giving case B', async () => {
		const r = await run({
			activeNote: DAILY,
			prompt: () => {
				const { answer, name } = openForm();
				name.value = 'Website Relaunch';
				name.dispatchEvent(enter());
				return answer;
			},
		});
		expect(r.contents.get('1 Projekte/Website Relaunch.md')).toBe('');
		expect(r.lines[1]).toBe('- Kickoff with design about [[Website Relaunch]]');
	});

	it('M: other keys and IME composition do not submit', () => {
		const { modal, name } = openForm();
		name.value = 'Website Relaunch';
		name.dispatchEvent({ type: 'keydown', key: 'a', preventDefault: vi.fn() });
		name.dispatchEvent({ ...enter(), isComposing: true });
		expect((modal as any).isOpen).toBe(true);
	});

	it('N: clicking Cancel resolves null', async () => {
		const { modal, answer, button, name } = openForm();
		name.value = 'Website Relaunch';
		button('Cancel').dispatchEvent({ type: 'click' });
		expect(await answer).toBeNull();
		expect((modal as any).isOpen).toBe(false);
	});

	it('E: resolves null when dismissed', async () => {
		const { modal, answer } = openForm();
		modal.close();
		expect(await answer).toBeNull();
	});

	it('O: an empty name shows an inline error, keeps the form open and refocuses; typing clears it', async () => {
		const { modal, answer, button, error, name } = openForm();
		expect(error.textContent).toBe('');
		name.value = '   ';
		button('Create').dispatchEvent({ type: 'click' });

		expect((modal as any).isOpen).toBe(true);
		expect(error.textContent).toBe('Enter a project name.');
		expect(name.attrs['aria-invalid']).toBe('true');
		expect(name.attrs['aria-describedby']).toBe(error.attrs.id);
		expect(name.focus).toHaveBeenCalledTimes(2);

		typeInto(name, 'W');
		expect(error.textContent).toBe('');
		expect(name.attrs['aria-invalid']).toBeUndefined();

		typeInto(name, 'Website Relaunch');
		name.dispatchEvent(enter());
		expect(await answer).toEqual({ name: 'Website Relaunch', alias: '' });
	});

	it('G: names the forbidden characters inline, each once', () => {
		const { modal, error, name } = openForm();
		name.value = 'a:b/c:d?';
		name.dispatchEvent(enter());
		expect((modal as any).isOpen).toBe(true);
		expect(error.textContent).toBe("A project name can't contain: : / ?");
	});

	it('G: an invalid name keeps the form open with nothing created until it is corrected', async () => {
		let seen: { open: boolean; error: string } | null = null;
		const r = await run({
			activeNote: DAILY,
			prompt: () => {
				const form = openForm();
				form.name.value = 'A/B';
				form.button('Create').dispatchEvent({ type: 'click' });
				seen = { open: (form.modal as any).isOpen, error: form.error.textContent };
				typeInto(form.name, 'AB');
				form.button('Create').dispatchEvent({ type: 'click' });
				return form.answer;
			},
		});
		expect(seen!.open).toBe(true);
		expect(seen!.error).toBe("A project name can't contain: /");
		expect([...r.contents.keys()]).toEqual(['1 Projekte/AB.md']);
		expect(r.lines[1]).toBe('- Kickoff with design about [[AB]]');
	});

	it('F: a name already taken shows a notice and keeps the form open until it is changed', async () => {
		notices.length = 0;
		const form = openForm(name => name === 'Website Relaunch');
		form.name.value = ' Website Relaunch ';
		form.alias.value = 'relaunch';
		form.alias.dispatchEvent(enter());
		expect((form.modal as any).isOpen).toBe(true);
		expect(notices[0]).toContain('Website Relaunch already exists');
		typeInto(form.name, 'Website Relaunch 2');
		form.button('Create').dispatchEvent({ type: 'click' });
		await expect(form.answer).resolves.toEqual({ name: 'Website Relaunch 2', alias: 'relaunch' });
	});
});
