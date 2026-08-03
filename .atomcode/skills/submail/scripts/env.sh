#!/usr/bin/env bash
# submail 临时 PATH 注入 —— source 一下，当前 shell（及其子进程）立刻能用裸 `submail`。
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
