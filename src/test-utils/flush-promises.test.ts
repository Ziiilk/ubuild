import { flushPromises } from './flush-promises';

describe('flushPromises', () => {
  it('returns a promise that resolves to undefined', async () => {
    const result = await flushPromises();
    expect(result).toBeUndefined();
  });

  it('flushes pending microtasks before resolving', async () => {
    let resolved = false;
    Promise.resolve().then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);

    await flushPromises();

    expect(resolved).toBe(true);
  });

  it('flushes multiple chained microtasks', async () => {
    const order: string[] = [];

    Promise.resolve().then(() => {
      order.push('first');
      return Promise.resolve().then(() => {
        order.push('second');
      });
    });

    await flushPromises();

    expect(order).toContain('first');
    expect(order).toContain('second');
  });

  it('can be called multiple times sequentially', async () => {
    let counter = 0;

    Promise.resolve().then(() => {
      counter++;
    });

    await flushPromises();
    expect(counter).toBe(1);

    Promise.resolve().then(() => {
      counter++;
    });

    await flushPromises();
    expect(counter).toBe(2);
  });

  it('flushes microtasks queued during a previous flushPromises call', async () => {
    let innerExecuted = false;

    Promise.resolve().then(() => {
      // Queue another microtask from inside the first one
      Promise.resolve().then(() => {
        innerExecuted = true;
      });
    });

    await flushPromises();

    expect(innerExecuted).toBe(true);
  });
});
