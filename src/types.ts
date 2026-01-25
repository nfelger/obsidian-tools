import type { TFile } from 'obsidian';

// === List Items ===

export interface ListItem {
	position: {
		start: { line: number; col: number; offset: number };
		end: { line: number; col: number; offset: number };
	};
	parent: number;
	task?: string;
}

export interface ChildrenBlock {
	startLine: number;
	endLine: number;
	lines: string[];
}

// === Wikilinks ===

export interface WikiLink {
	tfile: TFile;
	index: number;
	matchText: string;
	wikiInner: string;
}

export interface ParsedWikilink {
	linkPath: string;
	section: string | null;
	alias: string | null;
}

export interface WikilinkMatch {
	index: number;
	matchText: string;
	inner: string;
}

// === Periodic Notes ===

export interface NoteInfo {
	type: 'daily' | 'weekly' | 'monthly' | 'yearly';
	year: number;
	month?: number;
	day?: number;
	week?: number;
}
