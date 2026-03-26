# Contributing to ubuild

Thank you for your interest in contributing to ubuild! This document provides guidelines and instructions for contributing to the project.

## Development Setup

### Prerequisites

- Node.js 18 or higher
- npm 9 or higher

### Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd ubuild
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

## Development Workflow

### Building

Compile TypeScript to JavaScript:

```bash
npm run build
```

Watch mode for development:

```bash
npm run dev
```

### Testing

Run all tests:

```bash
npm test
```

Run a specific test file:

```bash
npx jest --runTestsByPath "src/commands/build.test.ts"
```

Run tests matching a pattern:

```bash
npx jest -t "should handle errors"
```

### Code Quality

Run linter:

```bash
npm run lint
```

Format code:

```bash
npm run format
```

## Project Structure

```
src/
├── cli/          # CLI entry point and command registration
├── commands/     # Commander command implementations
├── core/         # Core business logic
├── types/        # TypeScript type definitions
├── utils/        # Shared utilities
└── test-utils/   # Test utilities and fixtures
```

### Key Conventions

- **Commands**: Implement command registration in `src/commands/`. Export a function named `<name>Command(program: Command): void`.
- **Core Logic**: Place implementation logic in `src/core/` classes (e.g., `BuildExecutor`, `ProjectDetector`).
- **Types**: Define shared interfaces in `src/types/`.
- **Tests**: Co-locate tests with source files using `.test.ts` suffix.

## Writing Tests

### Test File Location

Place test files next to the source files they test:

```
src/core/build-executor.ts
src/core/build-executor.test.ts
```

### Test Structure

Use descriptive test names and group related tests:

```typescript
describe('BuildExecutor', () => {
  describe('execute', () => {
    it('should successfully build with valid options', async () => {
      // Test implementation
    });

    it('should throw error for invalid target', async () => {
      // Test implementation
    });
  });
});
```

### Using Test Utilities

Use the provided test utilities for consistent testing:

```typescript
import { createTempDir, createFakeProject, createFakeEngine } from '../test-utils';

const tempDir = await createTempDir();
const project = await createFakeProject(tempDir.path, { projectName: 'TestGame' });
const engine = await createFakeEngine(tempDir.path, {
  versionInfo: { MajorVersion: 5, MinorVersion: 3 },
});
```

## Coding Standards

### TypeScript

- Enable strict mode (enforced by `tsconfig.json`)
- Avoid using `any` type
- Use explicit return types for public functions
- Prefer interfaces over type aliases for object shapes

### Documentation

Add JSDoc comments to:

- All exported functions and classes
- Public methods
- Complex type definitions

Example:

````typescript
/**
 * Builds an Unreal Engine project with the specified configuration.
 *
 * @param options - Build configuration options
 * @returns Promise resolving to build result
 * @throws {Error} When build configuration is invalid
 *
 * @example
 * ```typescript
 * const result = await executor.execute({
 *   target: 'Editor',
 *   config: 'Development',
 *   platform: 'Win64'
 * });
 * ```
 */
async execute(options: BuildOptions): Promise<BuildResult> {
  // Implementation
}
````

### Error Handling

- Use descriptive error messages
- Wrap errors with context when propagating
- Use `Logger` for CLI output, not `console.log`

Example:

```typescript
try {
  await fs.access(path);
} catch (error) {
  throw new Error(
    `Failed to access project at ${path}: ${error instanceof Error ? error.message : String(error)}`
  );
}
```

## Submitting Changes

### Before Submitting

Ensure all checks pass:

```bash
npm run build
npm test
npm run lint
```

### Commit Messages

Use clear, descriptive commit messages:

- Use present tense ("Add feature" not "Added feature")
- Use imperative mood ("Move cursor to..." not "Moves cursor to...")
- Reference issues when applicable

Examples:

```
Add support for macOS builds
Fix engine detection for source builds
Update README with installation instructions
```

## Code Review Process

1. Changes are reviewed by maintainers
2. Address review comments promptly
3. Maintain test coverage for new code
4. Update documentation as needed

## Questions?

If you have questions about contributing:

1. Check existing documentation
2. Search closed issues
3. Open a new issue with your question

## License

By contributing to ubuild, you agree that your contributions will be licensed under the MIT License.
