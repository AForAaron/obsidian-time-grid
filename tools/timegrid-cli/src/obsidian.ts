/**
 * 构造 obsidian:// 链接。
 *
 * 格式：obsidian://open?vault=<name>&file=<path>
 *   - vault 用 vault 的 basename（Obsidian 用 vault 名而非绝对路径）
 *   - file 是 vault 相对路径
 *
 * 跳到具体行：Obsidian 内置 URI 不支持。
 * 跳到 TimeGrid 视图：需要 Advanced URI 插件，超出 MVP 范围。
 */

import { basename } from 'node:path';

export function buildObsidianUri(vaultPath: string, filePath: string): string {
	const vaultName = basename(vaultPath);
	return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(filePath)}`;
}
