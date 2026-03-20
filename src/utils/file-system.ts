import fs from 'fs-extra';
import path from 'path';

export class FileSystem {
  static async isDirectoryEmpty(dir: string): Promise<boolean> {
    try {
      if (!(await fs.pathExists(dir))) {
        return true;
      }

      const files = await fs.readdir(dir);
      return files.length === 0;
    } catch (error) {
      throw new Error(
        `Failed to check if directory is empty: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  static async findFile(dir: string, fileName: string, maxDepth = 3): Promise<string | null> {
    async function search(currentDir: string, depth: number): Promise<string | null> {
      if (depth > maxDepth) {
        return null;
      }

      try {
        const files = await fs.readdir(currentDir);

        for (const file of files) {
          const filePath = path.join(currentDir, file);
          const stat = await fs.stat(filePath);

          if (stat.isFile() && file === fileName) {
            return filePath;
          }

          if (stat.isDirectory() && !file.startsWith('.') && !file.startsWith('_')) {
            const found = await search(filePath, depth + 1);
            if (found) {
              return found;
            }
          }
        }
      } catch {
        return null;
      }

      return null;
    }

    return search(dir, 0);
  }

  static async ensureDirectory(dir: string): Promise<void> {
    await fs.ensureDir(dir);
  }

  static async copyDirectory(
    src: string,
    dest: string,
    options: {
      filter?: (src: string, dest: string) => boolean;
      transform?: (content: string, src: string, dest: string) => string;
    } = {}
  ): Promise<void> {
    await fs.ensureDir(dest);

    const items = await fs.readdir(src);

    for (const item of items) {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);

      if (options.filter && !options.filter(srcPath, destPath)) {
        continue;
      }

      const stat = await fs.stat(srcPath);

      if (stat.isDirectory()) {
        await this.copyDirectory(srcPath, destPath, options);
      } else {
        if (options.transform) {
          const content = await fs.readFile(srcPath, 'utf-8');
          const transformed = options.transform(content, srcPath, destPath);
          await fs.writeFile(destPath, transformed, 'utf-8');
        } else {
          await fs.copyFile(srcPath, destPath);
        }
      }
    }
  }

  static async readJson<T>(filePath: string): Promise<T> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (error) {
      throw new Error(
        `Failed to read JSON file ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  static async writeJson(filePath: string, data: unknown): Promise<void> {
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to write JSON file ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  static async isReadable(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  static relativePath(from: string, to: string): string {
    return path.relative(from, to);
  }

  static normalizePath(p: string): string {
    return path.normalize(p);
  }
}
