/**
 * Builds and mounts the whole UI into `root`.
 * Dynamic content is created exclusively with createElement/textContent —
 * no innerHTML anywhere, so API data can never be interpreted as markup.
 */
export declare function mountUi(root: HTMLElement): void;
