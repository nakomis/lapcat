import '@testing-library/jest-dom/vitest';

// jsdom has no ResizeObserver; Recharts' <ResponsiveContainer> needs one to
// measure itself. A no-op stub is enough — charts render at 0×0 in tests,
// which is fine since we assert on data/labels, not pixel geometry.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom reports 0 for offsetWidth/Height, so <ResponsiveContainer> (which
// skips rendering its children below a 1px size) never draws anything.
// Fixed non-zero dimensions are enough for tests that assert on chart
// content rather than pixel-perfect layout.
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 400 });
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 300 });
