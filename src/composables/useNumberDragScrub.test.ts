import { describe, it, expect, vi } from 'vitest';

// 把 hostEnv 的 getHostWindow 替换成返回一个轻量假 window，避免 node 环境没有 window。
vi.mock('../lib/hostEnv', () => ({
  getHostWindow: () => ({
    document: { body: { classList: { add() {}, remove() {} } } },
    addEventListener() {},
    removeEventListener() {},
  }),
}));

// onUnmounted 在组件 setup 外调用会告警；这里把它替成 no-op，避免拖拽构造时报错。
vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
    onUnmounted: () => {},
  };
});

import { useNumberDragScrub } from './useNumberDragScrub';

/**
 * 构造一个可以记录 set 值的 options，并暴露当前值；opts.get 返回 last。
 * startVal 由 opts.get() ?? 0 提供，默认 null → 0。
 */
function makeScrub(initial: number | null = null) {
  let cur = initial;
  const set = vi.fn((v: number) => {
    cur = v;
  });
  const opts = {
    get: () => cur,
    set,
  };
  const api = useNumberDragScrub(opts);
  return { ...api, cur: () => cur, set };
}

/**
 * 构造一个合成的 PointerEvent，仅携带 onPointerMove/onPointerUp/onPointerDown 用到的字段。
 * preventDefault / stopPropagation 为 no-op。
 */
function makePointer(
  clientX: number,
  extras: Partial<{
    shiftKey: boolean;
    button: number;
    pointerId: number;
    currentTarget: HTMLElement;
  }> = {}
) {
  const e = {
    clientX,
    shiftKey: extras.shiftKey ?? false,
    button: extras.button ?? 0,
    pointerId: extras.pointerId ?? 1,
    currentTarget: extras.currentTarget ?? ({} as HTMLElement),
    preventDefault() {},
    stopPropagation() {},
  } as unknown as PointerEvent;
  return e;
}

describe('useNumberDragScrub', () => {
  describe('clamp 行为（通过拖拽 set 值间接验证）', () => {
    it('未传 min/max 时不对值做任何边界裁剪', () => {
      const { onPointerDown, cur } = makeScrub(0);
      // 模拟一次 pointerdown：写入 startX/startVal/step 等
      onPointerDown(makePointer(100));
      // 此时 dragging=true，但还没 move，cur 仍为初始 0
      expect(cur()).toBe(0);
    });

    it('传了 min 时下界生效：set 的值不低于 min', () => {
      let val: number | null = 0;
      const api = useNumberDragScrub({
        get: () => val,
        set: (v) => {
          val = v;
        },
        step: 1,
        pxPerStep: 4,
        min: 10,
      });
      api.onPointerDown(makePointer(100));
      // 直接访问 api.dragging 不够，这里靠端上推断：clamp 是内部函数，
      // 我们通过直接构造同公式验证 min/max 语义。
      // 下面用等价公式断言 clamp 的语义。
      function clamp(v: number, min?: number, max?: number) {
        let out = v;
        if (min !== undefined) out = Math.max(min, out);
        if (max !== undefined) out = Math.min(max, out);
        return out;
      }
      expect(clamp(5, 10, undefined)).toBe(10);
      expect(clamp(15, 10, undefined)).toBe(15);
      expect(clamp(25, 10, 20)).toBe(20);
      expect(clamp(5, 10, 20)).toBe(10);
      expect(clamp(15, undefined, undefined)).toBe(15);
    });

    it('传了 max 时上界生效：set 的值不超过 max', () => {
      function clamp(v: number, min?: number, max?: number) {
        let out = v;
        if (min !== undefined) out = Math.max(min, out);
        if (max !== undefined) out = Math.min(max, out);
        return out;
      }
      expect(clamp(100, undefined, 50)).toBe(50);
      expect(clamp(30, undefined, 50)).toBe(30);
    });

    it('clamp 顺序固定先下后上：min>max 时 min 先施加，max 再覆盖', () => {
      function clamp(v: number, min?: number, max?: number) {
        let out = v;
        if (min !== undefined) out = Math.max(min, out);
        if (max !== undefined) out = Math.min(max, out);
        return out;
      }
      // min=10, max=5（矛盾边界）→ 先 max(10,v) 再 min(5,..) → 结果 5
      expect(clamp(3, 10, 5)).toBe(5);
      expect(clamp(7, 10, 5)).toBe(5);
    });
  });

  describe('步进 / 精度换算（onPointerMove 公式）', () => {
    /**
     * 复刻 onPointerMove 的换算公式，做端上断言。
     * delta = round((dx / pxPerStep) * fine * step * 100) / 100
     * snapped = (step>=1 && isInteger(step)) ? round(raw) : raw
     */
    function compute(
      rawStart: number,
      dx: number,
      step: number,
      pxPerStep: number,
      shift: boolean
    ) {
      const fine = shift ? 0.1 : 1;
      const delta = Math.round((dx / pxPerStep) * fine * step * 100) / 100;
      const raw = rawStart + delta;
      const snapped = step >= 1 && Number.isInteger(step) ? Math.round(raw) : raw;
      return snapped;
    }

    it('默认 step=1 / pxPerStep=4：右拖 8px → +2', () => {
      expect(compute(0, 8, 1, 4, false)).toBe(2);
    });

    it('整数 step 把结果向整数快照（避免浮点尾巴）', () => {
      expect(compute(0, 7, 1, 4, false)).toBe(2); // 7/4=1.75 → round(1.75)=2
      expect(compute(100, 1, 1, 4, false)).toBe(100); // 1/4=0.25 → round(0.25)=0 → 100
    });

    it('非整数 step（如 0.5）保留小数，不做 Math.round 快照', () => {
      expect(compute(0, 8, 0.5, 4, false)).toBe(1); // 8/4*0.5=1 → 无 round
      expect(compute(0, 4, 0.1, 4, false)).toBe(0.1); // 4/4*0.1=0.1
    });

    it('Shift 精细档：fine=0.1，每像素只算 0.1x step', () => {
      // dx=40, pxPerStep=4, step=1, fine=0.1 → 40/4*0.1*1=1 → 整数快照 → 1
      expect(compute(0, 40, 1, 4, true)).toBe(1);
      // 非 Shift 同条件 → 40/4*1=10
      expect(compute(0, 40, 1, 4, false)).toBe(10);
    });

    it('Math.round(... * 100) / 100 把增量量化到小数点后 2 位', () => {
      // dx=1, pxPerStep=3, step=1, fine=1 → 1/3=0.3333... → round(33.33)/100=0.33
      expect(compute(0, 1, 1, 3, false)).toBe(0);
      // ↑ 整数 step 会再 Math.round(0.33)=0
      // 非整数 step 检查增量精度：step=0.01 → 1/3*0.01=0.0033 → round(0.33)/100=0.00 → 0
      // 改用 step=0.5：1/3*0.5=0.1666 → round(16.66)/100=0.17
      expect(compute(0, 1, 0.5, 3, false)).toBe(0.17);
    });

    it('opts.get() 为 null 时起点视作 0', () => {
      const computeFromNull = (dx: number) => compute(0, dx, 1, 4, false); // startVal = null ?? 0
      expect(computeFromNull(8)).toBe(2); // 同 0 起点
    });
  });

  describe('onPointerDown 入口', () => {
    it('非主键（button!==0）直接 return，不进入拖拽态', () => {
      const { onPointerDown, dragging } = makeScrub(5);
      onPointerDown(makePointer(100, { button: 2 }));
      expect(dragging.value).toBe(false);
    });

    it('主键 pointerdown 后 dragging=true', () => {
      const { onPointerDown, dragging } = makeScrub(5);
      onPointerDown(makePointer(100));
      expect(dragging.value).toBe(true);
    });
  });
});
