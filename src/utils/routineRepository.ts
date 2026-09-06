import { App, TFile } from 'obsidian';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import {
	EMPTY_ROUTINE_DOCUMENT,
	RoutineDocument,
	RoutineMigrationPreview,
	RoutineSettings,
} from '../types/routine';
import { WriteResult } from '../types/task';
import {
	findLegacyRoutineBlocks,
	adoptLegacyRoutineInstances,
	insertRoutineInstancesAtSlot,
	parseRoutineDocument,
	replaceLegacyRoutineWithSlot,
	ROUTINE_INSTANCE_START_PREFIX,
	routineDocumentFromLegacy,
	separateRoutineInstanceCallouts,
	serializeRoutineDocument,
} from './routineFormat';
import { countMixedWords, WritingStatsTracker } from './writingStats';
import { ensureParentFolder } from './vaultPaths';

export interface RoutineDefinitionLoadResult {
	document: RoutineDocument;
	ready: boolean;
	diagnostics: string[];
}

export class RoutineRepository {
	private app: App;
	private getSettings: () => RoutineSettings;
	private writingStats: WritingStatsTracker;

	constructor(app: App, getSettings: () => RoutineSettings, writingStats: WritingStatsTracker) {
		this.app = app;
		this.getSettings = getSettings;
		this.writingStats = writingStats;
	}

	async loadDocument(): Promise<RoutineDefinitionLoadResult> {
		const file = this.getDefinitionFile();
		if (!file) return { document: EMPTY_ROUTINE_DOCUMENT, ready: false, diagnostics: ['Routine 配置笔记尚未创建'] };
		const content = await this.app.vault.cachedRead(file);
		const parsed = parseRoutineDocument(content);
		return {
			document: parsed.document,
			ready: !parsed.diagnostics.some((item) => item.blocking),
			diagnostics: parsed.diagnostics.map((item) => item.message),
		};
	}

	getDefinitionFile(): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(this.getSettings().definitionPath);
		return file instanceof TFile ? file : null;
	}

	getDailyTemplateFile(): TFile | null {
		const configured = getDailyNoteSettings()?.template?.trim();
		if (!configured) return null;
		for (const candidate of candidateMarkdownPaths(configured)) {
			const file = this.app.vault.getAbstractFileByPath(candidate);
			if (file instanceof TFile) return file;
		}
		return null;
	}

	async getMigrationPreview(now = new Date()): Promise<RoutineMigrationPreview | null> {
		const template = this.getDailyTemplateFile();
		if (!template) return null;
		const content = await this.app.vault.cachedRead(template);
		const document = routineDocumentFromLegacy(content);
		if (document.groups.length === 0) return null;
		return {
			templatePath: template.path,
			backupPath: availableBackupPath(this.app, backupPathForTemplate(template.path, now)),
			groups: document.groups,
			taskCount: document.groups.reduce((total, group) => total + group.items.length, 0),
		};
	}

	async migrateLegacyTemplate(now = new Date()): Promise<WriteResult> {
		const preview = await this.getMigrationPreview(now);
		if (!preview) return { ok: false, reason: 'read-only-task', message: '没有找到可迁移的旧每日流程模板区块' };
		const template = this.getDailyTemplateFile();
		if (!template || template.path !== preview.templatePath) {
			return { ok: false, reason: 'file-missing', message: '日记模板不存在或已改变' };
		}
		const existingDefinition = this.getDefinitionFile();
		if (existingDefinition) {
			return { ok: false, reason: 'line-mismatch-ambiguous', message: `配置笔记已存在：${existingDefinition.path}` };
		}

		const templateContent = await this.app.vault.cachedRead(template);
		const document = routineDocumentFromLegacy(templateContent);
		const replacement = replaceLegacyRoutineWithSlot(templateContent);
		if (!replacement.changed || replacement.error) {
			return { ok: false, reason: 'line-mismatch-not-found', message: replacement.error ?? '模板没有发生变化' };
		}

		try {
			await ensureParentFolder(this.app, preview.backupPath);
			await ensureParentFolder(this.app, this.getSettings().definitionPath);
			await this.app.vault.copy(template, preview.backupPath);
			const createdDefinition = await this.app.vault.create(this.getSettings().definitionPath, serializeRoutineDocument(document));
			let suppression = 0;
			try {
				await this.app.vault.process(template, (current) => {
					if (current !== templateContent) throw new Error('模板在迁移预览后已被修改，请重新预览');
					suppression = countMixedWords(replacement.content) - countMixedWords(current);
					this.writingStats.addTaskWriteSuppression(template.path, suppression);
					return replacement.content;
				});
			} catch (error) {
				if (suppression !== 0) this.writingStats.addTaskWriteSuppression(template.path, -suppression);
				await this.app.vault.delete(createdDefinition, true);
				throw error;
			}
			return { ok: true };
		} catch (error) {
			return { ok: false, reason: 'io-error', message: String(error) };
		}
	}

	async saveDocument(document: RoutineDocument, expected?: RoutineDocument): Promise<WriteResult> {
		const path = this.getSettings().definitionPath;
		const serialized = serializeRoutineDocument(document);
		const file = this.getDefinitionFile();
		try {
			if (!file) {
				await ensureParentFolder(this.app, path);
				await this.app.vault.create(path, serialized);
				return { ok: true };
			}
			let result: WriteResult = { ok: true };
			await this.app.vault.process(file, (content) => {
				const parsed = parseRoutineDocument(content);
				if (parsed.diagnostics.some((item) => item.blocking)) {
					result = { ok: false, reason: 'line-mismatch-ambiguous', message: 'Routine 配置笔记格式异常，已拒绝覆盖' };
					return content;
				}
				if (expected && serializeRoutineDocument(parsed.document) !== serializeRoutineDocument(expected)) {
					result = { ok: false, reason: 'line-mismatch-ambiguous', message: 'Routine 配置在编辑期间已改变，请刷新后重试' };
					return content;
				}
				const delta = countMixedWords(serialized) - countMixedWords(content);
				this.writingStats.addTaskWriteSuppression(file.path, delta);
				return serialized;
			});
			return result;
		} catch (error) {
			return { ok: false, reason: 'io-error', message: String(error) };
		}
	}

	async adoptTodayLegacyInstances(file: TFile, dateKey: string, document: RoutineDocument): Promise<WriteResult> {
		let result: WriteResult = { ok: true };
		let suppression = 0;
		try {
			await this.app.vault.process(file, (content) => {
				const adoption = adoptLegacyRoutineInstances(content, document, dateKey);
				if (adoption.error) {
					result = { ok: false, reason: 'line-mismatch-ambiguous', message: adoption.error };
					return content;
				}
				if (!adoption.changed) return content;
				suppression = countMixedWords(adoption.content) - countMixedWords(content);
				this.writingStats.addTaskWriteSuppression(file.path, suppression);
				return adoption.content;
			});
			return result;
		} catch (error) {
			if (suppression !== 0) this.writingStats.addTaskWriteSuppression(file.path, -suppression);
			return { ok: false, reason: 'io-error', message: String(error) };
		}
	}

	async ensureInstances(file: TFile, dateKey: string, document: RoutineDocument): Promise<WriteResult> {
		let result: WriteResult = { ok: true };
		let suppression = 0;
		try {
			await this.app.vault.process(file, (content) => {
				let next = content;
				if (!next.includes(ROUTINE_INSTANCE_START_PREFIX) && findLegacyRoutineBlocks(next).length > 0) {
					return content;
				}
				if (!next.includes(ROUTINE_INSTANCE_START_PREFIX)) {
					const insertion = insertRoutineInstancesAtSlot(next, document, dateKey);
					if (insertion.error) {
						result = { ok: false, reason: 'line-mismatch-not-found', message: insertion.error };
						return content;
					}
					next = insertion.content;
				}
				next = separateRoutineInstanceCallouts(next).content;
				if (next === content) return content;
				suppression = countMixedWords(next) - countMixedWords(content);
				this.writingStats.addTaskWriteSuppression(file.path, suppression);
				return next;
			});
			return result;
		} catch (error) {
			if (suppression !== 0) this.writingStats.addTaskWriteSuppression(file.path, -suppression);
			return { ok: false, reason: 'io-error', message: String(error) };
		}
	}
}

function candidateMarkdownPaths(path: string): string[] {
	const normalized = path.replace(/^\/+/, '');
	return normalized.toLocaleLowerCase().endsWith('.md') ? [normalized, `${normalized}.md`] : [normalized, `${normalized}.md`];
}

function backupPathForTemplate(templatePath: string, now: Date): string {
	const slash = templatePath.lastIndexOf('/');
	const folder = slash >= 0 ? `${templatePath.slice(0, slash)}/副本保留` : '副本保留';
	const name = slash >= 0 ? templatePath.slice(slash + 1) : templatePath;
	const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
	return `${folder}/${name}.time-grid-routine-backup-${stamp}.md`;
}

function availableBackupPath(app: App, preferred: string): string {
	if (!app.vault.getAbstractFileByPath(preferred)) return preferred;
	const extensionIndex = preferred.toLocaleLowerCase().endsWith('.md') ? preferred.length - 3 : preferred.length;
	for (let suffix = 2; suffix < 1000; suffix++) {
		const candidate = `${preferred.slice(0, extensionIndex)}-${suffix}${preferred.slice(extensionIndex)}`;
		if (!app.vault.getAbstractFileByPath(candidate)) return candidate;
	}
	throw new Error('无法为日记模板生成唯一备份路径');
}

function pad(value: number): string {
	return String(value).padStart(2, '0');
}
