// build.mjs — 用 esbuild 作为库 API 调用，避开 CLI 调用
import * as esbuild from '../../node_modules/esbuild/lib/main.js';
import { mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });

await esbuild.build({
	entryPoints: ['src/index.ts'],
	bundle: true,
	platform: 'node',
	target: 'node18',
	format: 'esm',
	outfile: 'dist/tg.mjs',
	alias: {
		'@timegrid/task-core': '../../src/utils/taskParser.ts',
		'@timegrid/task-types': '../../src/types/task.ts',
	},
	logLevel: 'info',
});

console.log('built dist/tg.mjs');
