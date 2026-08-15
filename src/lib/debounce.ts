export function debounce<T extends (...a: never[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout>;
  return ((...a: never[]) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  }) as unknown as T;
}
