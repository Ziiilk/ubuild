/**
 * Snapshot tests for CLI command output.
 *
 * These tests capture CLI output as Jest snapshots to detect
 * unintended formatting regressions in user-facing output.
 */

import { executeVersion } from './version';
import { createOutputCapture } from '../test-utils/capture-stream';
import * as fs from 'fs-extra';

jest.mock('fs-extra');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('CLI Output Snapshots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('version command', () => {
    it('matches snapshot for normal version output', async () => {
      const capture = createOutputCapture();

      mockedFs.readJson.mockResolvedValue({
        version: '1.0.0',
        name: '@zitool/ubuild',
        description: 'Unreal Engine project management CLI tool',
      });

      await executeVersion({ stdout: capture.stdout, stderr: capture.stderr });

      expect(capture.getStdout()).toMatchSnapshot('version-normal-output');
      expect(capture.getStderr()).toBe('');
    });

    it('matches snapshot for JSON version output', async () => {
      const capture = createOutputCapture();

      mockedFs.readJson.mockResolvedValue({
        version: '1.0.0',
        name: '@zitool/ubuild',
        description: 'Unreal Engine project management CLI tool',
      });

      await executeVersion({ stdout: capture.stdout, stderr: capture.stderr, json: true });

      expect(capture.getStdout()).toMatchSnapshot('version-json-output');
    });

    it('matches snapshot for fallback version output', async () => {
      const capture = createOutputCapture();

      mockedFs.readJson.mockRejectedValue(new Error('File not found'));

      await executeVersion({ stdout: capture.stdout, stderr: capture.stderr });

      expect(capture.getStdout()).toMatchSnapshot('version-fallback-output');
    });
  });
});
