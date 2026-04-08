import {
  buildRegistryOutput,
  buildEmptyRegistryOutput,
  createRegistryMock,
  RegistryEngineEntry,
} from './registry-fixtures';

const HKCU_KEY = 'HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\Unreal Engine\\Builds';
const HKLM_KEY = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Epic Games\\Unreal Engine\\Builds';

describe('buildRegistryOutput', () => {
  it('formats a single entry on one line by default', () => {
    const entries: RegistryEngineEntry[] = [{ guid: '{ABC}', path: 'C:\\Epic\\UE_5.3' }];

    const result = buildRegistryOutput(HKCU_KEY, entries);

    expect(result).toBe([HKCU_KEY, '{ABC}    REG_SZ    C:\\Epic\\UE_5.3'].join('\n'));
  });

  it('formats multiple single-line entries', () => {
    const entries: RegistryEngineEntry[] = [
      { guid: '{ABC}', path: 'C:\\Epic\\UE_5.3' },
      { guid: '{DEF}', path: 'D:\\Engines\\UE_5.4' },
    ];

    const result = buildRegistryOutput(HKCU_KEY, entries);

    expect(result).toBe(
      [
        HKCU_KEY,
        '{ABC}    REG_SZ    C:\\Epic\\UE_5.3',
        '{DEF}    REG_SZ    D:\\Engines\\UE_5.4',
      ].join('\n')
    );
  });

  it('formats a multiLine entry with GUID and REG_SZ on separate lines', () => {
    const entries: RegistryEngineEntry[] = [
      { guid: '{ABC}', path: 'C:\\Epic\\UE_5.3', multiLine: true },
    ];

    const result = buildRegistryOutput(HKCU_KEY, entries);

    expect(result).toBe([HKCU_KEY, '{ABC}', '    REG_SZ    C:\\Epic\\UE_5.3'].join('\n'));
  });

  it('formats mixed multiLine and single-line entries', () => {
    const entries: RegistryEngineEntry[] = [
      { guid: '{ABC}', path: 'C:\\Epic\\UE_5.3' },
      { guid: '{DEF}', path: 'D:\\Engines\\UE_5.4', multiLine: true },
    ];

    const result = buildRegistryOutput(HKCU_KEY, entries);

    expect(result).toBe(
      [
        HKCU_KEY,
        '{ABC}    REG_SZ    C:\\Epic\\UE_5.3',
        '{DEF}',
        '    REG_SZ    D:\\Engines\\UE_5.4',
      ].join('\n')
    );
  });

  it('returns just the key header when entries array is empty', () => {
    const result = buildRegistryOutput(HKCU_KEY, []);

    expect(result).toBe(HKCU_KEY);
  });
});

describe('buildEmptyRegistryOutput', () => {
  it('returns just the registry key string', () => {
    const result = buildEmptyRegistryOutput(HKCU_KEY);

    expect(result).toBe(HKCU_KEY);
  });
});

describe('createRegistryMock', () => {
  it('returns stdout for a known registry key', async () => {
    const mock = createRegistryMock({
      [HKCU_KEY]: [{ guid: '{ABC}', path: 'C:\\Epic\\UE_5.3' }],
    });

    const result = await mock('reg', ['query', HKCU_KEY, '/s']);

    expect(result.stdout).toBe([HKCU_KEY, '{ABC}    REG_SZ    C:\\Epic\\UE_5.3'].join('\n'));
  });

  it('throws error for unknown registry key', async () => {
    const mock = createRegistryMock({});

    await expect(mock('reg', ['query', 'HKCU\\Unknown', '/s'])).rejects.toThrow('unable to find');
  });

  it('handles multiple registry keys', async () => {
    const mock = createRegistryMock({
      [HKCU_KEY]: [{ guid: '{ABC}', path: 'C:\\Epic\\UE_5.3' }],
      [HKLM_KEY]: [{ guid: '{DEF}', path: 'D:\\Engines\\UE_5.4' }],
    });

    const resultA = await mock('reg', ['query', HKCU_KEY, '/s']);
    const resultB = await mock('reg', ['query', HKLM_KEY, '/s']);

    expect(resultA.stdout).toContain('{ABC}');
    expect(resultB.stdout).toContain('{DEF}');
  });

  it('throws error when args is undefined', async () => {
    const mock = createRegistryMock({
      [HKCU_KEY]: [{ guid: '{ABC}', path: 'C:\\Epic\\UE_5.3' }],
    });

    await expect(mock('reg')).rejects.toThrow('unable to find');
  });

  it('throws error when args has no second element', async () => {
    const mock = createRegistryMock({
      [HKCU_KEY]: [{ guid: '{ABC}', path: 'C:\\Epic\\UE_5.3' }],
    });

    await expect(mock('reg', ['query'])).rejects.toThrow('unable to find');
  });
});
