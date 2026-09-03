export class Plugin {}
export class App {}
export class TAbstractFile {}
export class TFile extends TAbstractFile {}
export class TFolder extends TAbstractFile {}
export class Notice {
	constructor(_message: unknown, _duration?: number) {}
}

export function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\.\//, '').trim();
}
