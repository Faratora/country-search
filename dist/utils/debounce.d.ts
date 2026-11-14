export declare function debounce<Args extends unknown[]>(fn: (...args: Args) => void, delay: number): {
    fn: (...args: Args) => void;
    cancel: () => void;
};
