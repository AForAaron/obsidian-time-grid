import { setIcon } from 'obsidian';
import { TaskPriority } from '../types/task';
import {
	PRIORITY_CHOICES,
	appendPriorityMenuLabel,
	priorityAriaLabel,
	priorityCode,
	priorityLevelClass,
	priorityName,
} from '../utils/taskUi';

export interface PriorityPickerHandle {
	getValue: () => TaskPriority | '';
	setValue: (value: TaskPriority | '') => void;
	setDisabled: (disabled: boolean) => void;
	destroy: () => void;
}

/**
 * 弹窗内自绘优先级选择器：触发器 + 展开列表，P 码分色、中文中性。
 * native &lt;select&gt; 无法给选项局部上色，故不用。
 */
export function mountPriorityPicker(
	parent: HTMLElement,
	initial: TaskPriority | '',
	options: { ariaLabel?: string } = {}
): PriorityPickerHandle {
	let value: TaskPriority | '' = initial;
	let open = false;
	let disabled = false;

	const root = parent.createDiv('tg-priority-picker');
	const trigger = root.createEl('button', {
		cls: 'tg-priority-picker-trigger',
		attr: {
			type: 'button',
			'aria-label': options.ariaLabel ?? '任务优先级',
			'aria-haspopup': 'listbox',
			'aria-expanded': 'false',
		},
	});
	const triggerLabel = trigger.createSpan('tg-priority-picker-trigger-label');
	const chevron = trigger.createSpan('tg-priority-picker-chevron');
	setIcon(chevron, 'chevron-down');

	const list = root.createDiv({
		cls: 'tg-priority-picker-list is-hidden',
		attr: { role: 'listbox', 'aria-label': options.ariaLabel ?? '选择优先级' },
	});

	const renderTrigger = (): void => {
		triggerLabel.empty();
		appendPriorityMenuLabel(triggerLabel, value);
		trigger.setAttr('aria-expanded', String(open));
	};

	const closeList = (): void => {
		open = false;
		list.addClass('is-hidden');
		trigger.setAttr('aria-expanded', 'false');
	};

	const openList = (): void => {
		if (disabled) return;
		open = true;
		list.removeClass('is-hidden');
		trigger.setAttr('aria-expanded', 'true');
		renderList();
	};

	const renderList = (): void => {
		list.empty();
		for (const choice of PRIORITY_CHOICES) {
			const selected = choice.value === value;
			const item = list.createEl('button', {
				cls: `tg-priority-picker-option${selected ? ' is-selected' : ''}`,
				attr: {
					type: 'button',
					role: 'option',
					'aria-selected': String(selected),
				},
			});
			const label = item.createSpan('tg-priority-picker-option-label');
			appendPriorityMenuLabel(label, choice.value);
			const check = item.createSpan('tg-priority-picker-check');
			if (selected) setIcon(check, 'check');
			item.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				value = choice.value;
				renderTrigger();
				closeList();
			});
		}
	};

	trigger.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (open) closeList();
		else openList();
	});

	const onDocPointer = (event: PointerEvent): void => {
		if (!open) return;
		const target = event.target;
		if (target instanceof Node && root.contains(target)) return;
		closeList();
	};
	document.addEventListener('pointerdown', onDocPointer, true);

	renderTrigger();

	return {
		getValue: () => value,
		setValue: (next) => {
			value = next;
			renderTrigger();
			if (open) renderList();
		},
		setDisabled: (next) => {
			disabled = next;
			trigger.disabled = next;
			if (next) closeList();
		},
		destroy: () => {
			document.removeEventListener('pointerdown', onDocPointer, true);
			root.remove();
		},
	};
}

/** 卡片 meta 行：仅彩色 P 码的 C1 胶囊 */
export function mountPriorityBadge(parent: HTMLElement, priority: TaskPriority): HTMLElement {
	const badge = parent.createSpan({
		cls: `tg-task-priority is-${priority} ${priorityLevelClass(priority)}`,
		attr: {
			title: priorityAriaLabel(priority),
			'aria-label': priorityAriaLabel(priority),
		},
	});
	badge.createSpan({
		cls: `tg-priority-code ${priorityLevelClass(priority)}`,
		text: priorityCode(priority),
	});
	return badge;
}

export { priorityCode, priorityName, priorityAriaLabel, priorityLevelClass, PRIORITY_CHOICES };
