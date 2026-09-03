import { App, normalizePath, TFolder } from 'obsidian';

/**
 * 确保目标文件的父目录存在，逐级创建。
 * 路径上任意一段已被普通文件占用时抛错，不会覆盖用户的文件。
 */
export async function ensureParentFolder(app: App, filePath: string): Promise<void> {
	const normalized = normalizePath(filePath);
	const slash = normalized.lastIndexOf('/');
	if (slash < 0) return;
	const parts = normalized.slice(0, slash).split('/');
	let current = '';
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		const existing = app.vault.getAbstractFileByPath(current);
		if (existing instanceof TFolder) continue;
		if (existing) throw new Error(`无法创建目录，路径已被文件占用：${current}`);
		await app.vault.createFolder(current);
	}
}
