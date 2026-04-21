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
const mockExecuteGencodebase = jest.fn();
const mockCleanCommand = jest.fn();
const mockSwitchCommand = jest.fn();
const mockExecuteSwitch = jest.fn();
const mockVersionCommand = jest.fn();

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
  executeGencodebase: mockExecuteGencodebase,
}));

jest.mock('./commands/clean', () => ({
  cleanCommand: mockCleanCommand,
}));

jest.mock('./commands/switch', () => ({
  switchCommand: mockSwitchCommand,
  executeSwitch: mockExecuteSwitch,
}));

jest.mock('./commands/version', () => ({
  versionCommand: mockVersionCommand,
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
  executeGencodebase,
  cleanCommand,
  switchCommand,
  executeSwitch,
  versionCommand,
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

    it('exports executeGencodebase', () => {
      expect(executeGencodebase).toBeDefined();
      expect(typeof executeGencodebase).toBe('function');
    });

    it('exports cleanCommand', () => {
      expect(cleanCommand).toBeDefined();
      expect(typeof cleanCommand).toBe('function');
    });

    it('exports switchCommand', () => {
      expect(switchCommand).toBeDefined();
      expect(typeof switchCommand).toBe('function');
    });

    it('exports executeSwitch', () => {
      expect(executeSwitch).toBeDefined();
      expect(typeof executeSwitch).toBe('function');
    });

    it('exports versionCommand', () => {
      expect(versionCommand).toBeDefined();
      expect(typeof versionCommand).toBe('function');
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

    it('cleanCommand can be called with a Commander program', () => {
      const program = createMockProgram();
      cleanCommand(program);
      expect(mockCleanCommand).toHaveBeenCalledWith(program);
    });

    it('versionCommand can be called with a Commander program', () => {
      const program = createMockProgram();
      versionCommand(program);
      expect(mockVersionCommand).toHaveBeenCalledWith(program);
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
      expect(executeGencodebase).toBe(mockExecuteGencodebase);
      expect(cleanCommand).toBe(mockCleanCommand);
      expect(versionCommand).toBe(mockVersionCommand);
    });
  });
});
