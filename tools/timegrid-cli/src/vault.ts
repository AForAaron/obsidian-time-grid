/**
 * 找 vault 路径。
 *
 * 优先级：
 *   1. 环境变量 TG_VAULT
 *   2. 当前工作目录或祖先目录里的 .timegrid-vault 文件
 *   3. ~/Library/Application Support/obsidian/obsidian.json 里唯一打开的 vault
 *   4. ~/.obsidian-vault（HOME 下的快捷配置）
 *
 * 找到后 fs.stat 校验存在性；找不到就抛错并提示。
 */

import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

const VAULT_MARKER = '.timegrid-vault';
const OBSIDIAN_JSON = join(
	homedir(),
	'Library/Application Support/obsidian/obsidian.json',
);

async function readMarker(path: string): Promise<string | null> {
	try {
		const raw = await readFile(path, 'utf8');
		const first = raw.split('\n')[0]?.trim();
		return first || null;
	} catch {
		return null;
	}
}

async function findMarkerUpwards(start: string): Promise<string | null> {
	let dir = resolve(start);
	for (let i = 0; i < 8; i++) {
		const candidate = join(dir, VAULT_MARKER);
		if (existsSync(candidate)) {
			return readMarker(candidate);
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

async function readObsidianDefault(): Promise<string | null> {
	try {
		const raw = await readFile(OBSIDIAN_JSON, 'utf8');
		const data = JSON.parse(raw) as {
			vaults?: Record<string, { path?: string; open?: boolean }>;
		};
		const vaults = Object.values(data.vaults ?? {}).filter((v) => v.path);
		const opened = vaults.find((v) => v.open);
		return opened?.path ?? (vaults.length === 1 ? vaults[0]?.path ?? null : null);
	} catch {
		return null;
	}
}

export async function locateVault(): Promise<string> {
	if (process.env.TG_VAULT) {
		const path = process.env.TG_VAULT;
		await assertExists(path);
		return path;
	}

	const fromCwd = await findMarkerUpwards(process.cwd());
	if (fromCwd) {
		await assertExists(fromCwd);
		return fromCwd;
	}

	const fromHome = await readMarker(join(homedir(), VAULT_MARKER));
	if (fromHome) {
		await assertExists(fromHome);
		return fromHome;
	}

	const fromObsidian = await readObsidianDefault();
	if (fromObsidian) {
		await assertExists(fromObsidian);
		return fromObsidian;
	}

	throw new Error(
		[
			'找不到 vault 路径。可以：',
			'  1. 设置环境变量 TG_VAULT=/path/to/vault',
			'  2. 在当前目录或父目录放一个 .timegrid-vault 写入 vault 绝对路径',
			'  3. 在 ~/放一个 .timegrid-vault',
			'  4. 打开 Obsidian，让它把 vault 路径写到 obsidian.json',
		].join('\n'),
	);
}

async function assertExists(path: string): Promise<void> {
	try {
		const s = await stat(path);
		if (!s.isDirectory()) {
			throw new Error(`vault 路径不是目录: ${path}`);
		}
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new Error(`vault 路径不存在: ${path}`);
		}
		throw err;
	}
}
