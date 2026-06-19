/**
 * Jest setup: write console.log directly to stdout so Jest's console interceptor
 * does not annotate every log line with "at Object.<anonymous> (...)" source info.
 */
declare const write: {
    (buffer: Uint8Array | string, cb?: (err?: Error | null) => void): boolean;
    (str: Uint8Array | string, encoding?: BufferEncoding, cb?: (err?: Error | null) => void): boolean;
};
//# sourceMappingURL=jest.setup.d.ts.map