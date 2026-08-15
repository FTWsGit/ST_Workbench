import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './debounce';

// ===== debounce =====

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('延迟 ms 后才调用', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    expect(fn).not.toBeCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toBeCalledTimes(1);
  });

  it('连续调用只执行最后一次（trailing）', () => {
    const fn = vi.fn((..._a: never[]) => {
      //记录参数
    });
    const d = debounce(fn, 100);
    d(1 as never);
    d(2 as never);
    d(3 as never);
    vi.advanceTimersByTime(100);
    expect(fn).toBeCalledTimes(1);
    expect(fn.mock.calls[0][0]).toBe(3);
  });

  it('触发后再次调用重新计时', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    vi.advanceTimersByTime(50);
    d();
    vi.advanceTimersByTime(50);
    expect(fn).not.toBeCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toBeCalledTimes(1);
  });

  it('clearTimeout：两次调用之间若定时器已 reset，不会提前触发', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    vi.advanceTimersByTime(99);
    expect(fn).not.toBeCalled();
    d();
    vi.advanceTimersByTime(99);
    expect(fn).not.toBeCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toBeCalledTimes(1);
  });
});
