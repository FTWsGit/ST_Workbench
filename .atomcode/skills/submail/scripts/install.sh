#!/usr/bin/env bash
# submail 安装：把 submail 目录加进 PATH，让裸 `submail` 命令全局可用。
#
# 为什么需要它：Git Bash 的非交互 shell（比如子 agent 的 bash 调用）不加载
# ~/.bashrc，所以只在 .bashrc 加 PATH 对子 agent 无效。要把目录写进
# Windows 系统级（User 级）环境变量，让所有新进程（含子 agent 的 bash）继承。
#
# 用法（Git Bash 里）:
#   bash submail/install.sh              # 默认：写入 Windows User 级 PATH（推荐，子 agent 也生效）
#   bash submail/install.sh --bashrc     # 备选：只写 ~/.bashrc（仅交互式 shell 生效）
#   bash submail/install.sh --check      # 只检查当前 PATH 状态
#
# 安全说明：用 PowerShell 的 [Environment]::SetEnvironmentVariable 写 User PATH，
# 不用 setx —— setx 有 1024 字符截断的历史问题，且会整段重写 PATH。
set -euo pipefail

TARGET_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WIN_DIR="$(cygpath -w "$TARGET_DIR" 2>/dev/null || echo "$TARGET_DIR")"
BASHRC="$HOME/.bashrc"

is_in_bashrc() {
    grep -qF "# >>> submail path >>>" "$BASHRC" 2>/dev/null
}

is_in_win_path() {
    # 通过 PowerShell 读取 User PATH，检查是否已含目标目录（忽略大小写、尾分号）。
    powershell -NoProfile -Command "\$p=[Environment]::GetEnvironmentVariable('Path','User'); if (\$p -and (\$p -split ';') -contains '$WIN_DIR') { exit 0 } else { exit 1 }"
}

add_to_bashrc() {
    if is_in_bashrc; then
        echo "✓ ~/.bashrc 已含 submail（幂等，跳过）。"
        return
    fi
    {
        echo ""
        echo "# >>> submail path >>>"
        echo "export PATH=\"$TARGET_DIR:\$PATH\""
        echo "# <<< submail path <<<"
    } >> "$BASHRC"
    echo "✓ 已写入 ~/.bashrc。仅交互式 Git Bash 生效；子 agent 请改用 --windows。"
}

add_to_win_path() {
    if is_in_win_path; then
        echo "✓ Windows User PATH 已含 $WIN_DIR（幂等，跳过）。"
        return
    fi
    # 追加到 User PATH（保留原有内容），PowerShell 处理，无 1024 截断问题。
    powershell -NoProfile -Command "\$p=[Environment]::GetEnvironmentVariable('Path','User'); \$new=if (\$p) { \$p.TrimEnd(';') + ';$WIN_DIR' } else { '$WIN_DIR' }; [Environment]::SetEnvironmentVariable('Path', \$new, 'User'); Write-Output ('added: ' + '$WIN_DIR')"
    echo "✓ 已写入 Windows User 级 PATH（新进程生效）。"
}

case "${1:-}" in
    --check)
        echo "== 当前状态 =="
        echo "目标目录: $WIN_DIR"
        if is_in_win_path; then echo "Windows User PATH: 已包含 ✓"; else echo "Windows User PATH: 未包含 ✗"; fi
        if is_in_bashrc; then echo "~/.bashrc: 已包含 ✓"; else echo "~/.bashrc: 未包含 ✗"; fi
        echo "当前 shell 裸 submail: $(command -v submail >/dev/null 2>&1 && echo 可用 || echo 不可用)"
        ;;
    --bashrc)
        add_to_bashrc
        ;;
    --windows)
        add_to_win_path
        ;;
    "")
        add_to_win_path
        ;;
    *)
        echo "用法: bash submail/install.sh [--windows | --bashrc | --check]" >&2
        exit 2
        ;;
esac

echo ""
echo "下一步："
echo "  1) 已安装的进程（含当前 AtomCode/终端）需重启后才继承新 PATH；"
echo "  2) 或临时生效（当前 shell 立即用，不影响他人）："
echo "       source submail/env.sh"
echo "  3) 验证：submail server status"
