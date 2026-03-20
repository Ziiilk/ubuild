export interface UProject {
  FileVersion: number;
  EngineAssociation: string;
  Category?: string;
  Description?: string;
  Modules: Array<{
    Name: string;
    Type: 'Runtime' | 'Editor' | 'Developer' | 'Program' | 'Server';
    LoadingPhase: 'Default' | 'PostConfigInit' | 'PreDefault' | string;
  }>;
  Plugins?: Array<{
    Name: string;
    Enabled: boolean;
    TargetAllowList?: string[];
  }>;
}

export interface ProjectInfo {
  name: string;
  path: string;
  uproject: UProject;
  sourceDir: string;
  targets: Array<{
    name: string;
    type: 'Editor' | 'Game' | 'Client' | 'Server';
    path: string;
  }>;
  modules: Array<{
    name: string;
    path: string;
  }>;
}

export interface ProjectDetectionOptions {
  cwd?: string;
  recursive?: boolean;
}

export interface ProjectDetectionResult {
  isValid: boolean;
  project?: ProjectInfo;
  error?: string;
  warnings: string[];
}

export interface ProjectPathResolution {
  inputPath: string;
  resolvedPath: string;
  isDirectory: boolean;
  wasResolvedFromDirectory: boolean;
  hasUProjectExtension: boolean;
}
