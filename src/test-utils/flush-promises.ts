/**
 * Flushes all pending microtasks (resolved promises) from the queue.
 * Use this instead of setTimeout-based delays when waiting for async
 * operations triggered by module imports or event handlers.
 *
 * @example
 * ```typescript
 * await import('./my-module'); // triggers async main()
 * await flushPromises();       // wait for all pending microtasks
 * expect(mockFn).toHaveBeenCalled();
 * ```
 *
 * @returns A promise that resolves after all pending microtasks complete
 */
export function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
