import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HotkeyModal } from '../../src/ui/HotkeyModal';
import { createMockApp } from '../mocks/obsidian';

// Mock the command modules
vi.mock('../../src/commands/migrateTask', () => ({
	migrateTask: vi.fn()
}));
vi.mock('../../src/commands/pushTaskDown', () => ({
	pushTaskDown: vi.fn()
}));
vi.mock('../../src/commands/pullTaskUp', () => ({
	pullTaskUp: vi.fn()
}));
vi.mock('../../src/commands/extractLog', () => ({
	extractLog: vi.fn()
}));
vi.mock('../../src/commands/finishProject', () => ({
	finishProject: vi.fn()
}));

import { migrateTask } from '../../src/commands/migrateTask';
import { pushTaskDown } from '../../src/commands/pushTaskDown';
import { pullTaskUp } from '../../src/commands/pullTaskUp';
import { extractLog } from '../../src/commands/extractLog';
import { finishProject } from '../../src/commands/finishProject';

describe('HotkeyModal', () => {
	let modal: HotkeyModal;
	let mockApp: ReturnType<typeof createMockApp>;
	let mockPlugin: any;

	beforeEach(() => {
		vi.clearAllMocks();
		mockApp = createMockApp();
		mockPlugin = {
			app: mockApp,
			settings: {}
		};
		modal = new HotkeyModal(mockApp as any, mockPlugin);
	});

	describe('bindings', () => {
		it('should have binding for migrate task (m)', () => {
			const bindings = modal.getBindings();
			const migrateBinding = bindings.find(b => b.key === 'm');

			expect(migrateBinding).toBeDefined();
			expect(migrateBinding?.label).toBe('Migrate task');
		});

		it('should have binding for push down (d)', () => {
			const bindings = modal.getBindings();
			const pushBinding = bindings.find(b => b.key === 'd');

			expect(pushBinding).toBeDefined();
			expect(pushBinding?.label).toBe('Push task down');
		});

		it('should have binding for pull up (u)', () => {
			const bindings = modal.getBindings();
			const pullBinding = bindings.find(b => b.key === 'u');

			expect(pullBinding).toBeDefined();
			expect(pullBinding?.label).toBe('Pull task up');
		});

		it('should have binding for extract log (x)', () => {
			const bindings = modal.getBindings();
			const extractBinding = bindings.find(b => b.key === 'x');

			expect(extractBinding).toBeDefined();
			expect(extractBinding?.label).toBe('Extract log');
		});

		it('should have binding for finish project (f)', () => {
			const bindings = modal.getBindings();
			const finishBinding = bindings.find(b => b.key === 'f');

			expect(finishBinding).toBeDefined();
			expect(finishBinding?.label).toBe('Finish project');
		});

		it('should have exactly 7 bindings', () => {
			const bindings = modal.getBindings();
			expect(bindings).toHaveLength(7);
		});
	});

	describe('key handling', () => {
		it('should register key handlers on open', () => {
			modal.open();

			// Check that scope.register was called for each binding
			expect(modal.scope.keys).toHaveLength(7);
			expect(modal.scope.keys.map((k: any) => k.key)).toEqual(['m', 'd', 'u', 'x', 't', 'p', 'f']);
		});

		it('should execute migrateTask when m is pressed', () => {
			modal.open();

			const handler = modal.scope.keys.find((k: any) => k.key === 'm');
			const mockEvent = { preventDefault: vi.fn() } as unknown as KeyboardEvent;

			handler?.callback(mockEvent);

			expect(migrateTask).toHaveBeenCalledWith(mockPlugin);
		});

		it('should execute pushTaskDown when d is pressed', () => {
			modal.open();

			const handler = modal.scope.keys.find((k: any) => k.key === 'd');
			const mockEvent = { preventDefault: vi.fn() } as unknown as KeyboardEvent;

			handler?.callback(mockEvent);

			expect(pushTaskDown).toHaveBeenCalledWith(mockPlugin);
		});

		it('should execute pullTaskUp when u is pressed', () => {
			modal.open();

			const handler = modal.scope.keys.find((k: any) => k.key === 'u');
			const mockEvent = { preventDefault: vi.fn() } as unknown as KeyboardEvent;

			handler?.callback(mockEvent);

			expect(pullTaskUp).toHaveBeenCalledWith(mockPlugin);
		});

		it('should execute extractLog when x is pressed', () => {
			modal.open();

			const handler = modal.scope.keys.find((k: any) => k.key === 'x');
			const mockEvent = { preventDefault: vi.fn() } as unknown as KeyboardEvent;

			handler?.callback(mockEvent);

			expect(extractLog).toHaveBeenCalledWith(mockPlugin);
		});

		it('should execute finishProject when f is pressed', () => {
			modal.open();

			const handler = modal.scope.keys.find((k: any) => k.key === 'f');
			const mockEvent = { preventDefault: vi.fn() } as unknown as KeyboardEvent;

			handler?.callback(mockEvent);

			expect(finishProject).toHaveBeenCalledWith(mockPlugin);
		});

		it('should close modal before executing command', () => {
			modal.open();
			expect(modal.isOpen).toBe(true);

			const handler = modal.scope.keys.find((k: any) => k.key === 'm');
			const mockEvent = { preventDefault: vi.fn() } as unknown as KeyboardEvent;

			handler?.callback(mockEvent);

			expect(modal.isOpen).toBe(false);
		});

		it('should prevent default event behavior', () => {
			modal.open();

			const handler = modal.scope.keys.find((k: any) => k.key === 'm');
			const mockEvent = { preventDefault: vi.fn() } as unknown as KeyboardEvent;

			handler?.callback(mockEvent);

			expect(mockEvent.preventDefault).toHaveBeenCalled();
		});
	});

	describe('rendering', () => {
		it('should add CSS class to content element on open', () => {
			modal.open();

			expect(modal.contentEl.addClass).toHaveBeenCalledWith('bullet-flow-hotkey-modal');
		});

		it('should create hotkey list container', () => {
			modal.open();

			expect(modal.contentEl.createDiv).toHaveBeenCalledWith({ cls: 'hotkey-list' });
		});

		it('should empty content on close', () => {
			modal.open();
			modal.close();

			expect(modal.contentEl.empty).toHaveBeenCalled();
		});
	});
});
