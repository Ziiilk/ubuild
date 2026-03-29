import { executeVersion, versionCommand } from './version';
import { Command } from 'commander';
import { createOutputCapture } from '../test-utils/capture-stream';
import * as fs from 'fs-extra';

jest.mock('fs-extra');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('versionCommand', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    jest.clearAllMocks();
  });

  it('registers the version command with correct name and description', () => {
    const commandSpy = jest.spyOn(program, 'command');
    versionCommand(program);

    expect(commandSpy).toHaveBeenCalledWith('version');
  });

  it('registers the v alias', () => {
    versionCommand(program);
    const versionCmd = program.commands.find((cmd) => cmd.name() === 'version');
    expect(versionCmd?.alias()).toBe('v');
  });

  it('registers --json option', () => {
    versionCommand(program);
    const versionCmd = program.commands.find((cmd) => cmd.name() === 'version');
    const options = versionCmd?.options || [];
    const jsonOption = options.find((opt) => opt.long === '--json');

    expect(jsonOption).toBeDefined();
    expect(jsonOption?.short).toBe('-j');
    expect(jsonOption?.description).toBe('Output result as JSON');
  });
});

describe('executeVersion', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    jest.clearAllMocks();
  });

  it('displays version information in normal mode', async () => {
    const { stdout, stderr, getStdout, getStderr } = createOutputCapture();

    mockedFs.readJson.mockResolvedValue({
      version: '1.0.0',
      name: '@test/package',
      description: 'Test package description',
    });

    await executeVersion({ stdout, stderr });

    const output = getStdout();
    expect(output).toContain('ubuild - Unreal Engine Project Management');
    expect(output).toContain('1.0.0');
    expect(output).toContain('@test/package');
    expect(output).toContain('Test package description');
    expect(getStderr()).toBe('');
  });

  it('outputs JSON when json flag is set', async () => {
    const { stdout, stderr, getStdout, getStderr } = createOutputCapture();

    mockedFs.readJson.mockResolvedValue({
      version: '1.0.0',
      name: '@test/package',
      description: 'Test package description',
    });

    await executeVersion({ stdout, stderr, json: true });

    const output = getStdout();
    const parsed = JSON.parse(output);
    expect(parsed).toEqual({
      version: '1.0.0',
      name: '@test/package',
      description: 'Test package description',
    });
    expect(getStderr()).toBe('');
  });

  it('uses fallback values when package.json cannot be read', async () => {
    const { stdout, stderr, getStdout } = createOutputCapture();

    mockedFs.readJson.mockRejectedValue(new Error('File not found'));

    await executeVersion({ stdout, stderr });

    const output = getStdout();
    expect(output).toContain('unknown');
    expect(output).toContain('@zitool/ubuild');
  });

  it('handles partial package.json data', async () => {
    const { stdout, getStdout } = createOutputCapture();

    mockedFs.readJson.mockResolvedValue({
      version: '2.0.0',
      // name and description missing
    });

    await executeVersion({ stdout });

    const output = getStdout();
    expect(output).toContain('2.0.0');
    expect(output).toContain('@zitool/ubuild');
    expect(output).toContain('Unreal Engine project management CLI tool');
  });

  it('works with default streams', async () => {
    mockedFs.readJson.mockResolvedValue({
      version: '0.0.8',
      name: '@zitool/ubuild',
      description: 'Test description',
    });

    // Should not throw when using default streams
    await expect(executeVersion()).resolves.not.toThrow();
  });

  it('displays success message in normal mode', async () => {
    const { stdout, getStdout } = createOutputCapture();

    mockedFs.readJson.mockResolvedValue({
      version: '1.0.0',
      name: '@test/package',
      description: 'Test description',
    });

    await executeVersion({ stdout });

    expect(getStdout()).toContain('Version information retrieved successfully');
  });

  it('does not display success message in JSON mode', async () => {
    const { stdout, getStdout } = createOutputCapture();

    mockedFs.readJson.mockResolvedValue({
      version: '1.0.0',
      name: '@test/package',
      description: 'Test description',
    });

    await executeVersion({ stdout, json: true });

    const output = getStdout();
    // Should be valid JSON only
    expect(() => JSON.parse(output)).not.toThrow();
    expect(output).not.toContain('Version information retrieved successfully');
  });

  it('command action executes version with json option', async () => {
    mockedFs.readJson.mockResolvedValue({
      version: '1.0.0',
      name: '@test/package',
      description: 'Test description',
    });

    versionCommand(program);
    const versionCmd = program.commands.find((cmd) => cmd.name() === 'version');

    // Simulate running the command with --json option
    await versionCmd?.parseAsync(['node', 'ubuild', '--json']);
  });

  it('command action executes version without json option', async () => {
    mockedFs.readJson.mockResolvedValue({
      version: '1.0.0',
      name: '@test/package',
      description: 'Test description',
    });

    versionCommand(program);
    const versionCmd = program.commands.find((cmd) => cmd.name() === 'version');

    // Simulate running the command without options
    await versionCmd?.parseAsync(['node', 'ubuild']);
  });

  it('command action calls handleCommandError when executeVersion throws', async () => {
    // getVersionInfo catches readJson errors internally and returns fallback values,
    // so to trigger handleCommandError we need the executeVersion flow to actually throw.
    // We mock Logger to throw, which happens after getVersionInfo succeeds.
    const { Logger } = await import('../utils/logger');
    const loggerSpy = jest.spyOn(Logger.prototype, 'title').mockImplementation(() => {
      throw new Error('Logger title failed');
    });

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as (code?: string | number | null | undefined) => never);

    mockedFs.readJson.mockResolvedValue({
      version: '1.0.0',
      name: '@test/package',
      description: 'Test description',
    });

    versionCommand(program);
    const versionCmd = program.commands.find((cmd) => cmd.name() === 'version');

    await expect(versionCmd?.parseAsync(['node', 'ubuild'])).rejects.toThrow('process.exit called');

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
    loggerSpy.mockRestore();
  });
});
