import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './debounce';

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls fn only after delay', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced();

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets timer on repeated calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced();
    vi.advanceTimersByTime(200);
    debounced();
    vi.advanceTimersByTime(200);

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes the latest arguments to fn', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced('a');
    debounced('b');
    debounced('c');

    vi.advanceTimersByTime(300);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('supports multiple arguments', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('x', 42, true);

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('x', 42, true);
  });

  it('does not call fn again after the delay elapsed without new calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced();
    vi.advanceTimersByTime(200);
    vi.advanceTimersByTime(1000);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('each debounced function keeps its own timer', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const debounced1 = debounce(fn1, 100);
    const debounced2 = debounce(fn2, 300);

    debounced1();
    debounced2();

    vi.advanceTimersByTime(100);
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(fn2).toHaveBeenCalledTimes(1);
  });
});
