import type { TFile } from 'obsidian';

export interface WikiLink {
	tfile: TFile;
	index: number;
	matchText: string;
	wikiInner: string;
}

export interface ChildrenBlock {
	startLine: number;
	endLine: number;
	lines: string[];
}

export interface ListItem {
	position: {
		start: { line: number; col: number; offset: number };
		end: { line: number; col: number; offset: number };
	};
	parent: number;
	task?: string;
}
