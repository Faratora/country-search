export function debounce(fn, delay) {
    let timerId = null;
    const scheduled = (...args) => {
        if (timerId !== null) {
            clearTimeout(timerId);
        }
        timerId = setTimeout(() => {
            fn(...args);
            timerId = null;
        }, delay);
    };
    const cancel = () => {
        if (timerId !== null) {
            clearTimeout(timerId);
            timerId = null;
        }
    };
    return { fn: scheduled, cancel };
}
