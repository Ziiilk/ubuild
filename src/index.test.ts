import { Command } from 'commander';

// Mock all command modules before importing index
const mockListCommand = jest.fn();
const mockEngineCommand = jest.fn();
const mockBuildCommand = jest.fn();
const mockGenerateCommand = jest.fn();
const mockInitCommand = jest.fn();
const mockRunCommand = jest.fn();
const mockUpdateCommand = jest.fn();
const mockGencodebaseCommand = jest.fn();
const mockEvolveCommand = jest.fn();
const mockCleanCommand = jest.fn();
const mockRunSelfEvolution = jest.fn();

jest.mock('./commands/list', () => ({
  listCommand: mockListCommand,
}));

jest.mock('./commands/engine', () => ({
  engineCommand: mockEngineCommand,
}));

jest.mock('./commands/build', () => ({
  buildCommand: mockBuildCommand,
}));

jest.mock('./commands/generate', () => ({
  generateCommand: mockGenerateCommand,
}));

jest.mock('./commands/init', () => ({
  initCommand: mockInitCommand,
}));

jest.mock('./commands/run', () => ({
  runCommand: mockRunCommand,
}));

jest.mock('./commands/update', () => ({
  updateCommand: mockUpdateCommand,
}));

jest.mock('./commands/gencodebase', () => ({
  gencodebaseCommand: mockGencodebaseCommand,
}));

jest.mock('./commands/evolve', () => ({
  evolveCommand: mockEvolveCommand,
}));

jest.mock('./commands/clean', () => ({
  cleanCommand: mockCleanCommand,
}));

jest.mock('./core/self-driver', () => ({
  runSelfEvolution: mockRunSelfEvolution,
}));

// Import after mocking
import {
  listCommand,
  engineCommand,
  buildCommand,
  generateCommand,
  initCommand,
  runCommand,
  updateCommand,
  gencodebaseCommand,
  evolveCommand,
  cleanCommand,
  runSelfEvolution,
} from './index';

describe('Public API exports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('command registration functions', () => {
    it('exports listCommand', () => {
      expect(listCommand).toBeDefined();
      expect(typeof listCommand).toBe('function');
    });

    it('exports engineCommand', () => {
      expect(engineCommand).toBeDefined();
      expect(typeof engineCommand).toBe('function');
    });

    it('exports buildCommand', () => {
      expect(buildCommand).toBeDefined();
      expect(typeof buildCommand).toBe('function');
    });

    it('exports generateCommand', () => {
      expect(generateCommand).toBeDefined();
      expect(typeof generateCommand).toBe('function');
    });

    it('exports initCommand', () => {
      expect(initCommand).toBeDefined();
      expect(typeof initCommand).toBe('function');
    });

    it('exports runCommand', () => {
      expect(runCommand).toBeDefined();
      expect(typeof runCommand).toBe('function');
    });

    it('exports updateCommand', () => {
      expect(updateCommand).toBeDefined();
      expect(typeof updateCommand).toBe('function');
    });

    it('exports gencodebaseCommand', () => {
      expect(gencodebaseCommand).toBeDefined();
      expect(typeof gencodebaseCommand).toBe('function');
    });

    it('exports evolveCommand', () => {
      expect(evolveCommand).toBeDefined();
      expect(typeof evolveCommand).toBe('function');
    });

    it('exports cleanCommand', () => {
      expect(cleanCommand).toBeDefined();
      expect(typeof cleanCommand).toBe('function');
    });

    it('exports runSelfEvolution', () => {
      expect(runSelfEvolution).toBeDefined();
      expect(typeof runSelfEvolution).toBe('function');
    });
  });

  describe('command function behavior', () => {
    const createMockProgram = (): Command => {
      const program = new Command();
      jest
        .spyOn(program, 'command')
        .mockReturnValue(program as unknown as ReturnType<Command['command']>);
      jest
        .spyOn(program, 'description')
        .mockReturnValue(program as unknown as ReturnType<Command['description']>);
      jest
        .spyOn(program, 'option')
        .mockReturnValue(program as unknown as ReturnType<Command['option']>);
      jest
        .spyOn(program, 'action')
        .mockReturnValue(program as unknown as ReturnType<Command['action']>);
      return program;
    };

    it('listCommand can be called with a Commander program', () => {
      const program = createMockProgram();
      listCommand(program);
      expect(mockListCommand).toHaveBeenCalledWith(program);
    });

    it('engineCommand can be called with a Commander program', () => {
      const program = createMockProgram();
      engineCommand(program);
      expect(mockEngineCommand).toHaveBeenCalledWith(program);
    });

    it('buildCommand can be called with a Commander program', () => {
      const program = createMockProgram();
      buildCommand(program);
      expect(mockBuildCommand).toHaveBeenCalledWith(program);
    });

    it('generateCommand can be called with a Commander program', () => {
      const program = createMockProgram();
      generateCommand(program);
      expect(mockGenerateCommand).toHaveBeenCalledWith(program);
    });

    it('initCommand can be called with a Commander program', () => {
      const program = createMockProgram();
      initCommand(program);
      expect(mockInitCommand).toHaveBeenCalledWith(program);
    });

    it('runCommand can be called with a Commander program', () => {
      const program = createMockProgram();
      runCommand(program);
      expect(mockRunCommand).toHaveBeenCalledWith(program);
    });

    it('updateCommand can be called with a Commander program', () => {
      const program = createMockProgram();
      updateCommand(program);
      expect(mockUpdateCommand).toHaveBeenCalledWith(program);
    });

    it('gencodebaseCommand can be called with a Commander program', () => {
      const program = createMockProgram();
      gencodebaseCommand(program);
      expect(mockGencodebaseCommand).toHaveBeenCalledWith(program);
    });

    it('evolveCommand can be called with a Commander program', () => {
      const program = createMockProgram();
      evolveCommand(program);
      expect(mockEvolveCommand).toHaveBeenCalledWith(program);
    });

    it('cleanCommand can be called with a Commander program', () => {
      const program = createMockProgram();
      cleanCommand(program);
      expect(mockCleanCommand).toHaveBeenCalledWith(program);
    });
  });

  describe('runSelfEvolution function', () => {
    it('can be called with options', async () => {
      mockRunSelfEvolution.mockResolvedValue(undefined);

      const options = {
        interval: 5000,
        model: 'gpt-4',
      };

      await runSelfEvolution(options);
      expect(mockRunSelfEvolution).toHaveBeenCalledWith(options);
    });

    it('can be called without options', async () => {
      mockRunSelfEvolution.mockResolvedValue(undefined);

      await runSelfEvolution();
      expect(mockRunSelfEvolution).toHaveBeenCalledTimes(1);
      expect(mockRunSelfEvolution.mock.calls[0]).toHaveLength(0);
    });

    it('propagates errors from the underlying function', async () => {
      const error = new Error('Evolution failed');
      mockRunSelfEvolution.mockRejectedValue(error);

      await expect(runSelfEvolution()).rejects.toThrow('Evolution failed');
    });
  });

  describe('exports are properly wired to mocked implementations', () => {
    it('all commands are re-exported from their respective modules', () => {
      // This verifies the re-export chain is working
      expect(listCommand).toBe(mockListCommand);
      expect(engineCommand).toBe(mockEngineCommand);
      expect(buildCommand).toBe(mockBuildCommand);
      expect(generateCommand).toBe(mockGenerateCommand);
      expect(initCommand).toBe(mockInitCommand);
      expect(runCommand).toBe(mockRunCommand);
      expect(updateCommand).toBe(mockUpdateCommand);
      expect(gencodebaseCommand).toBe(mockGencodebaseCommand);
      expect(evolveCommand).toBe(mockEvolveCommand);
      expect(cleanCommand).toBe(mockCleanCommand);
      expect(runSelfEvolution).toBe(mockRunSelfEvolution);
    });
  });
});
