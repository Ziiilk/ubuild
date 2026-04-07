/**
 * Test utilities for ubuild.
 *
 * This module provides helper functions and classes for testing ubuild commands
 * and core modules. These utilities help create temporary directories, capture
 * output streams, mock Unreal Engine projects/engines, and simulate process
 * execution.
 *
 * @example
 * ```typescript
 * import { createTempDir, createOutputCapture, createFakeProject } from './test-utils';
 *
 * // Create a temp directory for test files
 * const tempDir = await createTempDir();
 *
 * // Capture command output
 * const capture = createOutputCapture();
 *
 * // Create a fake Unreal project
 * const project = await createFakeProject(tempDir.path, { projectName: 'TestGame' });
 * ```
 */

export * from './capture-stream';
export * from './execa-child';
export * from './flush-promises';
export * from './registry-fixtures';
export * from './temp-dir';
export * from './test-contexts';
export * from './unreal-fixtures';
