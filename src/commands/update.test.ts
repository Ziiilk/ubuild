import { executeUpdate } from './update';
import { createOutputCapture } from '../test-utils';

const mockExeca = jest.fn();
const mockReadJson = jest.fn();

jest.mock('execa', () => ({
  execa: (...args: unknown[]) => mockExeca(...args),
}));

jest.mock('fs-extra', () => ({
  readJson: (...args: unknown[]) => mockReadJson(...args),
}));

describe('executeUpdate', () => {
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error(`process.exit called`);
    }) as (code?: string | number | null | undefined) => never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('displays current version and checks for updates', async () => {
    const capture = createOutputCapture();
    mockReadJson.mockResolvedValue({ version: '0.0.8' });
    mockExeca.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === 'npm' && args[0] === 'view') {
        return { stdout: '0.0.9', stderr: '' };
      }
      if (cmd === 'npm' && args[0] === 'list' && args[1] === '-g') {
        return { stdout: '', stderr: '' };
      }
      if (cmd === 'npm' && args[0] === 'list' && args[1] !== '-g') {
        return { stdout: '@zitool/ubuild@0.0.9', stderr: '' };
      }
      if (cmd === 'npm' && args[0] === 'install') {
        return { stdout: '', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd} ${args.join(' ')}`);
    });

    await executeUpdate({ stdout: capture.stdout, stderr: capture.stderr });

    expect(capture.getStdout()).toContain('Update ubuild');
    expect(capture.getStdout()).toContain('Current version: 0.0.8');
    expect(mockExeca).toHaveBeenCalledWith('npm', ['view', '@zitool/ubuild', 'version']);
  });

  it('notifies when already on latest version', async () => {
    const capture = createOutputCapture();
    mockReadJson.mockResolvedValue({ version: '0.0.9' });
    mockExeca.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === 'npm' && args[0] === 'view') {
        return { stdout: '0.0.9', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd} ${args.join(' ')}`);
    });

    await executeUpdate({ stdout: capture.stdout, stderr: capture.stderr });

    expect(capture.getStdout()).toContain('You are already using the latest version!');
  });

  it('performs global update when globally installed', async () => {
    const capture = createOutputCapture();
    mockReadJson.mockResolvedValue({ version: '0.0.8' });
    mockExeca.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === 'npm' && args[0] === 'view') {
        return { stdout: '0.0.9', stderr: '' };
      }
      if (cmd === 'npm' && args[0] === 'list' && args[1] === '-g') {
        return { stdout: '/usr/lib/node_modules/@zitool/ubuild', stderr: '' };
      }
      if (cmd === 'npm' && args[0] === 'install' && args[1] === '-g') {
        return { stdout: '', stderr: '' };
      }
      if (cmd === 'npm' && args[0] === 'list' && args[1] !== '-g') {
        return { stdout: '@zitool/ubuild@0.0.9', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd} ${args.join(' ')}`);
    });

    await executeUpdate({ stdout: capture.stdout, stderr: capture.stderr });

    expect(capture.getStdout()).toContain('Detected global installation, updating globally...');
    expect(mockExeca).toHaveBeenCalledWith('npm', ['install', '-g', '@zitool/ubuild']);
    expect(capture.getStdout()).toContain('Successfully updated to version 0.0.9');
  });

  it('performs local update when locally installed', async () => {
    const capture = createOutputCapture();
    mockReadJson.mockResolvedValue({ version: '0.0.8' });
    mockExeca.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === 'npm' && args[0] === 'view') {
        return { stdout: '0.0.9', stderr: '' };
      }
      if (cmd === 'npm' && args[0] === 'list' && args[1] === '-g') {
        return { stdout: '', stderr: '' };
      }
      if (cmd === 'npm' && args[0] === 'install' && args[1] !== '-g') {
        return { stdout: '', stderr: '' };
      }
      if (cmd === 'npm' && args[0] === 'list' && args[1] !== '-g') {
        return { stdout: '@zitool/ubuild@0.0.9', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd} ${args.join(' ')}`);
    });

    await executeUpdate({ stdout: capture.stdout, stderr: capture.stderr });

    expect(capture.getStdout()).toContain('Detected local installation, updating locally...');
    expect(mockExeca).toHaveBeenCalledWith('npm', ['install', '@zitool/ubuild@latest']);
    expect(capture.getStdout()).toContain('Successfully updated to version 0.0.9');
  });

  it('exits with error when unable to fetch latest version', async () => {
    const capture = createOutputCapture();
    mockReadJson.mockResolvedValue({ version: '0.0.8' });
    mockExeca.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === 'npm' && args[0] === 'view') {
        return { stdout: '', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd} ${args.join(' ')}`);
    });

    await expect(executeUpdate({ stdout: capture.stdout, stderr: capture.stderr })).rejects.toThrow(
      'process.exit called'
    );
  });

  it('handles npm command failures gracefully', async () => {
    const capture = createOutputCapture();
    mockReadJson.mockResolvedValue({ version: '0.0.8' });
    mockExeca.mockRejectedValue(new Error('Network error'));

    await expect(executeUpdate({ stdout: capture.stdout, stderr: capture.stderr })).rejects.toThrow(
      'process.exit called'
    );
  });

  it('handles fs read errors gracefully', async () => {
    const capture = createOutputCapture();
    mockReadJson.mockRejectedValue(new Error('File not found'));

    await expect(executeUpdate({ stdout: capture.stdout, stderr: capture.stderr })).rejects.toThrow(
      'process.exit called'
    );
  });
});
