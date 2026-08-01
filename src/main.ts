import { Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { TimeGridView, TIME_GRID_VIEW } from './views/TimeGridView';
import { TaskSettings } from './types/task';
import { TaskIndex } from './utils/taskIndex';
import { TaskWriter } from './utils/taskWriter';
import { normalizeTimeGridData, TimeGridPluginData, WritingStatsTracker } from './utils/writingStats';

export default class TimeGridPlugin extends Plugin {
	private dataStore: TimeGridPluginData;
	private writingStats: WritingStatsTracker;
	private taskIndex: TaskIndex;
	private taskWriter: TaskWriter;
	private metadataResolvedHandled = false;

	async onload() {
		this.dataStore = normalizeTimeGridData(await this.loadData());
		this.writingStats = new WritingStatsTracker(this, this.dataStore, async () => {
			await this.saveData(this.dataStore);
		});
		this.writingStats.registerEvents();
		void this.writingStats.initializeBaselines();
		this.taskIndex = new TaskIndex(this.app, () => this.dataStore.taskSettings);
		this.taskWriter = new TaskWriter(this.app, this.taskIndex, () => this.dataStore.taskSettings, this.writingStats);
		this.registerTaskIndexEvents();
		this.addSettingTab(new TimeGridSettingTab(this.app, this));

		// 注册右侧面板视图
		this.registerView(
			TIME_GRID_VIEW,
			(leaf) => new TimeGridView(
				leaf,
				this.writingStats,
				this.taskIndex,
				this.taskWriter,
				() => this.dataStore.taskSettings,
				() => this.dataStore.taskPanelState,
				async (state) => {
					this.dataStore.taskPanelState = state;
					await this.saveData(this.dataStore);
				}
			)
		);

		// 在右侧打开面板
		this.app.workspace.onLayoutReady(() => {
			void this.taskIndex.rebuild();
			this.activateView();
		});
	}

	async onunload() {
		this.taskIndex?.destroy();
	}

	getTaskSettings(): TaskSettings {
		return this.dataStore.taskSettings;
	}

	async updateTaskSettings(patch: Partial<TaskSettings>): Promise<void> {
		this.dataStore.taskSettings = { ...this.dataStore.taskSettings, ...patch };
		await this.saveData(this.dataStore);
		this.taskIndex.notifySettingsChanged();
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(TIME_GRID_VIEW)[0];
		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({ type: TIME_GRID_VIEW, active: true });
				leaf = rightLeaf;
			}
		}
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	private registerTaskIndexEvents(): void {
		this.registerEvent(this.app.metadataCache.on('changed', (file) => {
			if (file instanceof TFile && file.extension === 'md') this.taskIndex.scheduleReindex(file);
		}));
		this.registerEvent(this.app.metadataCache.on('resolved', () => {
			if (this.metadataResolvedHandled) return;
			this.metadataResolvedHandled = true;
			void this.taskIndex.rebuild();
		}));
		this.registerEvent(this.app.vault.on('delete', (file) => this.taskIndex.dropFile(file.path)));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			this.taskIndex.dropFile(oldPath);
			if (file instanceof TFile && file.extension === 'md') this.taskIndex.scheduleReindex(file);
		}));
	}
}

class TimeGridSettingTab extends PluginSettingTab {
	private plugin: TimeGridPlugin;

	constructor(app: TimeGridPlugin['app'], plugin: TimeGridPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Time Grid' });
		containerEl.createEl('h3', { text: '任务' });
		const settings = this.plugin.getTaskSettings();

		new Setting(containerEl)
			.setName('启用任务面板')
			.setDesc('在 Time Grid 底部显示全库任务。')
			.addToggle((toggle) => toggle.setValue(settings.enabled).onChange((value) => this.plugin.updateTaskSettings({ enabled: value })));
		new Setting(containerEl)
			.setName('排除路径')
			.setDesc('Vault 根目录相对路径，逗号分隔。路径仅匹配自身及子目录。')
			.addText((text) => text.setPlaceholder('00-Templates').setValue(settings.excludedPaths).onChange((value) => this.plugin.updateTaskSettings({ excludedPaths: value })));
		new Setting(containerEl)
			.setName('长期任务标签')
			.setDesc('默认 #goal；修改后任务会立即重新分类。')
			.addText((text) => text.setValue(settings.goalTag).onChange((value) => {
				const normalized = value.trim().startsWith('#') ? value.trim() : '#goal';
				return this.plugin.updateTaskSettings({ goalTag: normalized });
			}));
		new Setting(containerEl)
			.setName('显示任务所在文件名')
			.addToggle((toggle) => toggle.setValue(settings.showFileName).onChange((value) => this.plugin.updateTaskSettings({ showFileName: value })));
		new Setting(containerEl)
			.setName('记录终态日期')
			.setDesc('完成时写入 ✅ 日期，取消时写入 ❌ 日期；重新打开时移除。')
			.addToggle((toggle) => toggle.setValue(settings.recordTerminalDate).onChange((value) => this.plugin.updateTaskSettings({ recordTerminalDate: value })));
		new Setting(containerEl)
			.setName('已完成区显示范围')
			.addDropdown((dropdown) => dropdown
				.addOption('today', '仅今日')
				.addOption('7days', '近 7 天')
				.addOption('all', '全部')
				.setValue(settings.doneRange)
				.onChange((value) => this.plugin.updateTaskSettings({ doneRange: value as TaskSettings['doneRange'] })));
		new Setting(containerEl)
			.setName('每区最多渲染条数')
			.setDesc('全库任务超过 200 条时生效。')
			.addText((text) => {
				text.inputEl.type = 'number';
				text.inputEl.min = '1';
				text.inputEl.max = '1000';
				return text.setValue(String(settings.renderLimit)).onChange((value) => {
					const parsed = Number(value);
					if (Number.isFinite(parsed)) return this.plugin.updateTaskSettings({ renderLimit: Math.min(1000, Math.max(1, Math.round(parsed))) });
				});
			});
	}
}
