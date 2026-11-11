export class HttpError extends Error {
    constructor(status, message) {
        super(message ?? `HTTP error ${status}`);
        this.status = status;
        this.name = 'HttpError';
    }
}
