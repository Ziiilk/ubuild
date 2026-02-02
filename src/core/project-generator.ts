import { execa } from 'execa';
import path from 'path';
import fs from 'fs-extra';
import { GenerateOptions, GenerateResult, IDE } from '../types/generate';
import { Logger } from '../utils/logger';
import { Platform } from '../utils/platform';

export class ProjectGenerator {
  /**
   * Generate IDE project files
   */
  static async generate(options: GenerateOptions): Promise<GenerateResult> {
    const generatedFiles: string[] = [];

    try {
      // Validate options
      const validatedOptions = await this.validateOptions(options);
      const { ide, projectPath, enginePath, force } = validatedOptions;

      Logger.info(`Generating ${ide.toUpperCase()} project files`);
      Logger.info(`Project: ${projectPath}`);
      Logger.info(`Engine: ${enginePath}`);

      // Generate using UnrealBuildTool (UBT 原生生成对应 IDE 方案)
      if (ide === 'sln' || ide === 'vs2022') {
        await this.generateWithUBT(enginePath, projectPath, force, ide);
        generatedFiles.push(...await this.findGeneratedSolutionFiles(projectPath));
      } else if (ide === 'vscode') {
        await this.generateWithUBT(enginePath, projectPath, force, ide);
        generatedFiles.push(...await this.findGeneratedSolutionFiles(projectPath));
        generatedFiles.push(...await this.findVSCodeWorkspaceFiles(projectPath));
        generatedFiles.push(...await this.findVSCodeConfigFiles(projectPath));
      } else if (ide === 'clion') {
        await this.generateWithUBT(enginePath, projectPath, force, ide);
        generatedFiles.push(...await this.findGeneratedCLionFiles(projectPath));
      } else if (ide === 'xcode') {
        await this.generateWithUBT(enginePath, projectPath, force, ide);
        generatedFiles.push(...await this.findGeneratedXcodeFiles(projectPath));
      } else {
        await this.generateWithUBT(enginePath, projectPath, force, ide);
        generatedFiles.push(...await this.findGeneratedSolutionFiles(projectPath));
      }

      return {
        success: true,
        generatedFiles
      };

    } catch (error) {
      return {
        success: false,
        generatedFiles,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Validate and complete generate options
   */
  private static async validateOptions(options: GenerateOptions): Promise<Required<GenerateOptions>> {
    const ide: IDE = options.ide || 'sln';
    const force = options.force || false;

    // Validate project path
    let projectPath = options.projectPath || process.cwd();
    if (await fs.pathExists(projectPath) && (await fs.stat(projectPath)).isDirectory()) {
      // Look for .uproject file
      const uprojectFiles = await fs.readdir(projectPath).then(files =>
        files.filter(f => f.endsWith('.uproject'))
      );

      if (uprojectFiles.length > 0) {
        projectPath = path.join(projectPath, uprojectFiles[0]);
      } else {
        throw new Error(`No .uproject file found in project directory: ${projectPath}`);
      }
    }

    // Validate engine path
    let enginePath = options.enginePath;
    if (!enginePath) {
      // Try to resolve engine path
      const { EngineResolver } = await import('./engine-resolver');
      const engineResult = await EngineResolver.resolveEngine(projectPath);
      if (!engineResult.engine) {
        throw new Error('Could not determine engine path. Please specify --engine-path');
      }
      enginePath = engineResult.engine.path;
    }

    // Validate engine path exists
    if (!(await fs.pathExists(enginePath))) {
      throw new Error(`Engine path does not exist: ${enginePath}`);
    }

    return {
      ide,
      projectPath,
      enginePath,
      force
    };
  }

  /**
   * Generate project files using UnrealBuildTool (UBT 原生方案，不叠加自定义配置)
   */
  private static async generateWithUBT(
    enginePath: string,
    projectPath: string,
    force: boolean,
    ide: IDE
  ): Promise<void> {
    const ubtPath = path.join(
      enginePath,
      'Engine',
      'Binaries',
      'DotNET',
      'UnrealBuildTool',
      `UnrealBuildTool${Platform.exeExtension()}`
    );

    if (!(await fs.pathExists(ubtPath))) {
      throw new Error(`UnrealBuildTool not found at: ${ubtPath}`);
    }

    const args = [
      '-projectfiles',
      `-project="${projectPath}"`,
      '-game',
      '-engine'
    ];

    if (ide === 'vscode') {
      args.push('-VSCode');
    } else if (ide === 'clion') {
      args.push('-CLion');
    } else if (ide === 'xcode') {
      args.push('-XCodeProjectFiles');
    }
    // sln / vs2022：不传 IDE 参数，UBT 默认生成 Visual Studio 方案

    if (force) {
      args.push('-force');
    }

    Logger.debug(`Executing: ${ubtPath} ${args.join(' ')}`);

    const command = `"${ubtPath}" ${args.join(' ')}`;
    const childProcess = execa(command, {
      stdio: 'pipe',
      cwd: path.dirname(ubtPath),
      shell: true
    });

    // Stream output
    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        if (!output.includes('Log file created')) {
          process.stdout.write(output);
        }
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        process.stderr.write(data.toString());
      });
    }

    const result = await childProcess;

    if (result.exitCode !== 0) {
      throw new Error(`Project generation failed with exit code ${result.exitCode}`);
    }

    Logger.success('Project files generated successfully');
  }

  /**
   * Find generated solution files
   */
  private static async findGeneratedSolutionFiles(projectPath: string): Promise<string[]> {
    const projectDir = path.dirname(projectPath);
    const solutionFiles: string[] = [];

    // Look for .sln files
    const slnFiles = await fs.readdir(projectDir).then(files =>
      files.filter(f => f.endsWith('.sln'))
    );

    solutionFiles.push(...slnFiles.map(f => path.join(projectDir, f)));

    // Look for project filter files
    const filterFiles = await fs.readdir(projectDir).then(files =>
      files.filter(f => f.endsWith('.vcxproj.filters'))
    );

    solutionFiles.push(...filterFiles.map(f => path.join(projectDir, f)));

    // Look for project files
    const vcxprojFiles = await fs.readdir(projectDir).then(files =>
      files.filter(f => f.endsWith('.vcxproj'))
    );

    solutionFiles.push(...vcxprojFiles.map(f => path.join(projectDir, f)));

    return solutionFiles;
  }

  /**
   * Find UBT 生成的 CLion/CMake 文件（CMakeLists.txt）
   */
  private static async findGeneratedCLionFiles(projectPath: string): Promise<string[]> {
    const projectDir = path.dirname(projectPath);
    const cmakePath = path.join(projectDir, 'CMakeLists.txt');
    if (await fs.pathExists(cmakePath)) {
      return [cmakePath];
    }
    return [];
  }

  /**
   * Find UBT 生成的 Xcode 项目（.xcodeproj）
   */
  private static async findGeneratedXcodeFiles(projectPath: string): Promise<string[]> {
    const projectDir = path.dirname(projectPath);
    const entries = await fs.readdir(projectDir, { withFileTypes: true });
    const files = entries
      .filter(e => e.isDirectory() && e.name.endsWith('.xcodeproj'))
      .map(e => path.join(projectDir, e.name));
    return files;
  }

  /**
   * Find UBT 生成的 .code-workspace 文件
   */
  private static async findVSCodeWorkspaceFiles(projectPath: string): Promise<string[]> {
    const projectDir = path.dirname(projectPath);
    const files = await fs.readdir(projectDir).then(list =>
      list.filter(f => f.endsWith('.code-workspace')).map(f => path.join(projectDir, f))
    );
    return files;
  }

  /**
   * Find VSCode configuration files (.vscode 目录，由 UBT 生成)
   */
  private static async findVSCodeConfigFiles(projectPath: string): Promise<string[]> {
    const projectDir = path.dirname(projectPath);
    const vscodeDir = path.join(projectDir, '.vscode');

    if (!(await fs.pathExists(vscodeDir))) {
      return [];
    }

    const vscodeFiles = await fs.readdir(vscodeDir).then(files =>
      files.map(f => path.join(vscodeDir, f))
    );

    return vscodeFiles;
  }
}