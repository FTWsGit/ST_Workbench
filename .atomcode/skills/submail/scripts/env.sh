#!/usr/bin/env bash
# submail 临时 PATH 注入 —— source 一下，当前 shell（及其子进程）立刻能用裸 `submail`。
#
# 用法（在当前 shell 里执行，而不是 bash env.sh）:
#   source submail/env.sh
#   submail send --to w1 --from w2 --body "hi"
#
# 为什么有它：Git Bash 非交互 shell 不加载 ~/.bashrc，子 agent 的 bash 调用
# 拿不到 .bashrc 里加的 PATH。source 本脚本可临时补上；想一劳永逸用 install.sh --windows。
#
# 幂等：重复 source 不会重复加目录。

SUBMail_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case ":${PATH}:" in
    *":${SUBMail_DIR}:"*)
        echo "submail: ${SUBMail_DIR} 已在 PATH 中" >&2
        ;;
    *)
        export PATH="${SUBMail_DIR}:${PATH}"
        echo "submail: 已临时加入 PATH → ${SUBMail_DIR}" >&2
        ;;
esac
