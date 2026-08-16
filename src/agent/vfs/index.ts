/* VFS 分派入口：按 path 第一段（workspace）派到对应 resolver。
 *
 * tool 层只调 getResolver(workspace)，不写 `if (workspace === ...)` 分支——新增 resolver 只需
 * 在这里登记，不用改每个 tool 的 domain 分支。
 */
import type { VfsResolver } from './types';
import { presetResolver } from './presetResolver';
import { worldbookResolver } from './worldbookResolver';
import { characterResolver } from './characterResolver';

const RESOLVERS: Record<string, VfsResolver> = {
  preset: presetResolver,
  worldbook: worldbookResolver,
  character: characterResolver,
};

export function getResolver(workspace: string): VfsResolver | undefined {
  return RESOLVERS[workspace];
}
