/**
 * 原子写 HTML 文件。
 *
 * 流程：先写 .tmp，再 rename 到最终路径。
 *   - 写完后即便 process crash，也只会留 .tmp 残骸，不会让 Shortcut 读到半成品
 *   - rename 在同一文件系统下是原子的，Shortcut 永远读到完整文件
 *
 * 输出位置：$TMPDIR/timegrid-today.html（os.tmpdir() 解析出真实路径）
 *  Shortcut 用 `file://$TMPDIR/timegrid-today.html` 显示。
 */

import { writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const FILE_NAME = 'timegrid-today.html';

export async function writeHtml(content: string): Promise<string> {
	const dir = tmpdir();
	const finalPath = join(dir, FILE_NAME);
	const tmpPath = `${finalPath}.tmp`;
	await writeFile(tmpPath, content, 'utf8');
	// 清理可能残留的旧文件（macOS rename 会覆盖，但保险起见）
	try {
		await unlink(finalPath);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw err;
		}
	}
	await rename(tmpPath, finalPath);
	return finalPath;
}
