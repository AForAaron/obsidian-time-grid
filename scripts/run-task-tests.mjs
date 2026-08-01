import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const tempDirectory = await mkdtemp(join(tmpdir(), 'time-grid-tests-'));
const outputFile = join(tempDirectory, 'task-core-tests.cjs');

try {
	await build({
		entryPoints: ['tests/taskCore.test.ts'],
		bundle: true,
		platform: 'node',
		format: 'cjs',
		target: 'node16',
		outfile: outputFile,
		logLevel: 'silent',
		plugins: [{
			name: 'obsidian-stub',
			setup(builder) {
				builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: resolve('tests/obsidianStub.ts') }));
			},
		}],
	});
	const result = spawnSync(process.execPath, [outputFile], { stdio: 'inherit' });
	process.exitCode = result.status ?? 1;
} finally {
	await rm(tempDirectory, { recursive: true, force: true });
}
