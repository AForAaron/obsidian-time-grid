#!/bin/bash

set -euo pipefail

# Time Grid 插件安装脚本
# 用法:
#   ./install.sh                    # 自动解析 vault（见下方优先级）
#   ./install.sh /path/to/vault     # 显式指定 vault 根目录
#   TIMEGRID_VAULT=/path npm run deploy

CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

resolve_vault_from_obsidian_json() {
	local obsidian_json="${HOME}/Library/Application Support/obsidian/obsidian.json"
	if [ ! -f "$obsidian_json" ]; then
		return 1
	fi

	node - "$obsidian_json" <<'NODE'
const fs = require('fs');
const jsonPath = process.argv[2];

let data;
try {
	data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
} catch {
	process.exit(1);
}

const vaults = Object.values(data.vaults || {}).filter((vault) => vault.path);
const openVaults = vaults.filter((vault) => vault.open);

function printCandidates(title, items) {
	console.error(title);
	for (const vault of items) {
		console.error(`  - ${vault.path}`);
	}
}

if (openVaults.length === 1) {
	console.log(openVaults[0].path);
	process.exit(0);
}

if (openVaults.length > 1) {
	printCandidates('多个 vault 当前打开，请设置 TIMEGRID_VAULT 或 .timegrid-vault：', openVaults);
	process.exit(2);
}

if (vaults.length === 1) {
	console.log(vaults[0].path);
	process.exit(0);
}

if (vaults.length > 1) {
	printCandidates('未找到唯一 vault，候选如下：', vaults);
	process.exit(3);
}

process.exit(1);
NODE
}

resolve_vault_path() {
	if [ -n "${TIMEGRID_VAULT:-}" ]; then
		printf '%s\n' "$TIMEGRID_VAULT"
		return 0
	fi

	local config_file="$CURRENT_DIR/.timegrid-vault"
	if [ -f "$config_file" ]; then
		local configured_path
		configured_path="$(sed -n '1s/^[[:space:]]*//;s/[[:space:]]*$//p' "$config_file")"
		if [ -n "$configured_path" ]; then
			printf '%s\n' "$configured_path"
			return 0
		fi
	fi

	resolve_vault_from_obsidian_json
}

if [ "$#" -ge 1 ] && [ -n "${1:-}" ]; then
	VAULT_PATH="$1"
else
	if ! VAULT_PATH="$(resolve_vault_path)"; then
		echo "错误: 无法确定 Obsidian vault 路径。"
		echo ""
		echo "请任选其一："
		echo "  1. 创建 .timegrid-vault（可参考 .timegrid-vault.example）"
		echo "  2. 设置环境变量 TIMEGRID_VAULT=/path/to/vault"
		echo "  3. 直接传参: ./install.sh /path/to/vault"
		exit 1
	fi
	echo "使用 vault: $VAULT_PATH"
fi

PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/time-grid"

if [ -f "$CURRENT_DIR/styles.css" ]; then
	STYLE_SOURCE="$CURRENT_DIR/styles.css"
elif [ -f "$CURRENT_DIR/src/styles/main.css" ]; then
	STYLE_SOURCE="$CURRENT_DIR/src/styles/main.css"
else
	echo "错误: 未找到 styles.css 或 src/styles/main.css"
	exit 1
fi

# 检查 vault 目录是否存在
if [ ! -d "$VAULT_PATH" ]; then
	echo "错误: Vault 目录不存在: $VAULT_PATH"
	exit 1
fi

# 检查 .obsidian 目录
if [ ! -d "$VAULT_PATH/.obsidian" ]; then
	echo "警告: 未找到 .obsidian 目录，将创建..."
	mkdir -p "$VAULT_PATH/.obsidian/plugins"
fi

# 创建插件目录
echo "创建插件目录: $PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR"

# 复制必要文件
echo "复制插件文件..."
cp "$CURRENT_DIR/main.js" "$PLUGIN_DIR/"
cp "$CURRENT_DIR/manifest.json" "$PLUGIN_DIR/"
cp "$STYLE_SOURCE" "$PLUGIN_DIR/styles.css"

# 检查文件是否复制成功
if [ -f "$PLUGIN_DIR/main.js" ] && [ -f "$PLUGIN_DIR/manifest.json" ] && [ -f "$PLUGIN_DIR/styles.css" ]; then
	echo "✅ 插件安装成功！"
	echo ""
	echo "下一步："
	echo "1. 打开 Obsidian"
	echo "2. 进入 设置 → 第三方插件"
	echo "3. 关闭安全模式（如果启用）"
	echo "4. 在已安装插件列表中找到 'Time Grid' 并启用"
else
	echo "❌ 安装失败，请检查文件权限"
	exit 1
fi
