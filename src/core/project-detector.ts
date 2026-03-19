import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { UProject, ProjectInfo, ProjectDetectionOptions, ProjectDetectionResult } from '../types/project';

export class ProjectDetector {
  static async detectProject(options: ProjectDetectionOptions = {}): Promise<ProjectDetectionResult> {
    const cwd = options.cwd || process.cwd();
    const warnings: string[] = [];

    try {
      const uprojectFiles = await this.findUProjectFiles(cwd, options.recursive);

      if (uprojectFiles.length === 0) {
        return {
          isValid: false,
          error: 'No Unreal Engine project (.uproject) file found',
          warnings
        };
      }

      const uprojectPath = uprojectFiles[0];
      const projectDir = path.dirname(uprojectPath);

      const uproject = await this.parseUProject(uprojectPath);

      const validationResult = this.validateUProject(uproject);
      if (!validationResult.isValid) {
        return {
          isValid: false,
          error: `Invalid .uproject file: ${validationResult.error}`,
          warnings: [...warnings, ...validationResult.warnings]
        };
      }

      const projectName = path.basename(uprojectPath, '.uproject');

      const sourceDir = path.join(projectDir, 'Source');
      const hasSourceDir = await fs.pathExists(sourceDir);

      if (!hasSourceDir) {
        warnings.push('Source directory not found - this may be a blueprint-only project');
      }

      const targets = hasSourceDir ? await this.findTargetFiles(sourceDir) : [];

      const modules = hasSourceDir ? await this.findModuleFiles(sourceDir) : [];

      const projectInfo: ProjectInfo = {
        name: projectName,
        path: projectDir,
        uproject,
        sourceDir: hasSourceDir ? sourceDir : '',
        targets,
        modules
      };

      return {
        isValid: true,
        project: projectInfo,
        warnings
      };

    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : String(error),
        warnings
      };
    }
  }

  private static async findUProjectFiles(cwd: string, recursive?: boolean): Promise<string[]> {
    const pattern = recursive ? '**/*.uproject' : '*.uproject';
    return await glob(pattern, { cwd, absolute: true });
  }

  private static async parseUProject(uprojectPath: string): Promise<UProject> {
    const content = await fs.readFile(uprojectPath, 'utf-8');
    return JSON.parse(content);
  }

  private static validateUProject(uproject: UProject): { isValid: boolean; error?: string; warnings: string[] } {
    const warnings: string[] = [];

    if (uproject.FileVersion === undefined) {
      return { isValid: false, error: 'Missing FileVersion field', warnings };
    }

    if (uproject.FileVersion !== 3) {
      warnings.push(`Unexpected FileVersion: ${uproject.FileVersion}. Expected 3.`);
    }

    if (!uproject.EngineAssociation) {
      return { isValid: false, error: 'Missing EngineAssociation field', warnings };
    }

    if (!uproject.Modules || !Array.isArray(uproject.Modules)) {
      return { isValid: false, error: 'Missing or invalid Modules array', warnings };
    }

    return { isValid: true, warnings };
  }

  private static async findTargetFiles(sourceDir: string): Promise<ProjectInfo['targets']> {
    const files = await glob('*.Target.cs', { cwd: sourceDir, absolute: false });

    const targets = files.map(file => {
      const fileName = path.basename(file, '.Target.cs');
      let type: 'Editor' | 'Game' | 'Client' | 'Server' = 'Game';

      if (fileName.toLowerCase().includes('editor')) {
        type = 'Editor';
      } else if (fileName.toLowerCase().includes('client')) {
        type = 'Client';
      } else if (fileName.toLowerCase().includes('server')) {
        type = 'Server';
      }

      return {
        name: fileName,
        type,
        path: path.join(sourceDir, file)
      };
    });

    return targets;
  }

  private static async findModuleFiles(sourceDir: string): Promise<ProjectInfo['modules']> {
    const files = await glob('**/*.Build.cs', { cwd: sourceDir, absolute: false });

    const modules = files.map(file => {
      const moduleName = path.basename(file, '.Build.cs');
      return {
        name: moduleName,
        path: path.join(sourceDir, file)
      };
    });

    return modules;
  }
}
