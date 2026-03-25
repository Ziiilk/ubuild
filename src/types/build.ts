import { Writable } from 'stream';
import { Logger } from '../utils/logger';

export type BuildTarget = 'Editor' | 'Game' | 'Client' | 'Server' | string;
export type BuildConfiguration = 'Debug' | 'DebugGame' | 'Development' | 'Shipping' | 'Test';
export type BuildPlatform = 'Win64' | 'Win32' | 'Linux' | 'Mac' | 'Android' | 'IOS';

export interface BuildOptions {
  target?: BuildTarget;
  config?: BuildConfiguration;
  platform?: BuildPlatform;
  projectPath?: string;
  enginePath?: string;
  clean?: boolean;
  verbose?: boolean;
  additionalArgs?: string[];
  logger?: Logger;
  stdout?: Writable;
  stderr?: Writable;
  silent?: boolean;
}

export interface BuildResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  error?: string;
}
