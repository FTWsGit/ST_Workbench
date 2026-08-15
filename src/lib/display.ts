import type { VarMacroKind } from './variables';

export function esc(t: string): string {
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function span(cls: string, inner: string): string {
  return `<span class="${cls}">${inner}</span>`;
}

export function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** setvar/addvar/getvar 的 badge label + CSS class 映射。 */
export function varOpBadge(kind: VarMacroKind): { cls: string; label: string } {
  switch (kind) {
    case 'set':
      return { cls: 'set', label: 'SET' };
    case 'get':
      return { cls: 'get', label: 'GET' };
    case 'add':
      return { cls: 'add', label: 'ADD' };
    case 'inc':
      return { cls: 'inc', label: 'INC' };
    case 'dec':
      return { cls: 'dec', label: 'DEC' };
    case 'has':
      return { cls: 'has', label: 'HAS' };
    case 'delete':
      return { cls: 'delete', label: 'DEL' };
  }
}

/** prompt block 的 role → CSS class 后缀（'user'/'asst'/'sys'），可加 prefix。 */
export function roleClass(role: string | undefined, prefix = ''): string {
  const suffix = role === 'user' ? 'user' : role === 'assistant' ? 'asst' : 'sys';
  return prefix + suffix;
}
