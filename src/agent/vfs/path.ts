/* VFS 路径解析：纯函数，不依赖 store/Vue。
 *
 * 路径 = '/' + workspace + 0..N 段 segment。第一段固定是 workspace（decision 0001 的
 * domain/workspace 两轴路由——VFS 路径只是把这套已存在的路由语义序列化成字符串）。
 * 深度上限 MAX_PATH_SEGMENTS 防 JSON pointer 式无限下钻：资源树层级由 resolver 显式声明，
 * 不是底层 JSON 结构的镜像。
 */
import type { Workspace } from '../../types';

export const WORKSPACES: readonly Workspace[] = ['preset', 'worldbook', 'character'];

/** 最大路径段数：workspace + collection + alias + field。更深即拒绝。 */
export const MAX_PATH_SEGMENTS = 4;

export interface VfsPath {
  workspace: Workspace;
  /** workspace 之后的段，如 ['prompts', '1', 'content']。空数组 = workspace 根。 */
  segments: string[];
}

export type VfsPathResult = { ok: true; path: VfsPath } | { ok: false; error: string };

export function parseVfsPath(input: string): VfsPathResult {
  const raw = typeof input === 'string' ? input : '';
  if (!raw.trim()) return { ok: false, error: 'empty path' };

  // 去首尾斜杠再切；中间连续 '/' 会留下空段，下面统一报错。
  const body = raw.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!body) return { ok: false, error: `path has no workspace: "${raw}"` };

  const segments = body.split('/');
  if (segments.some((s) => s === '')) {
    return { ok: false, error: `repeated '/' (empty segment) in path: "${raw}"` };
  }
  if (segments.some((s) => s === '.' || s === '..')) {
    return { ok: false, error: `illegal segment '.' or '..' in path: "${raw}"` };
  }
  if (segments.length > MAX_PATH_SEGMENTS) {
    return { ok: false, error: `path too deep (max ${MAX_PATH_SEGMENTS} segments): "${raw}"` };
  }

  const workspace = segments[0];
  if (!(WORKSPACES as readonly string[]).includes(workspace)) {
    return {
      ok: false,
      error: `unknown workspace "${workspace}" (expected ${WORKSPACES.join('/')})`,
    };
  }

  return {
    ok: true,
    path: { workspace: workspace as Workspace, segments: segments.slice(1) },
  };
}

export function formatVfsPath(path: VfsPath): string {
  return '/' + [path.workspace, ...path.segments].join('/');
}
