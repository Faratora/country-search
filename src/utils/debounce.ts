export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
): { fn: (...args: Args) => void; cancel: () => void } {
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const scheduled = (...args: Args): void => {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      fn(...args);
      timerId = null;
    }, delay);
  };

  const cancel = (): void => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  return { fn: scheduled, cancel };
}
