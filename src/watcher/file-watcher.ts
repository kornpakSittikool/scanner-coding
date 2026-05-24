import * as chokidar from 'chokidar';
import * as path from 'path';
import { CodeIndexer } from '../parser/indexer';

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private indexer: CodeIndexer;
  private rootDir: string;

  constructor(indexer: CodeIndexer, rootDir: string) {
    this.indexer = indexer;
    this.rootDir = path.resolve(rootDir).replace(/\\/g, '/');
  }

  start(excludeDirs: string[] = ['node_modules', 'dist', '.git', '.repo-scanner']): void {
    const watchPattern = `${this.rootDir}/**/*.{ts,tsx,js,jsx,prisma}`;
    
    // Set up chokidar
    this.watcher = chokidar.watch(this.rootDir, {
      ignored: (filePath, stats) => {
        // Ignore dotfiles and excluded folders
        const base = path.basename(filePath);
        if (base.startsWith('.') && base !== '.tsx' && base !== '.ts' && base !== '.jsx' && base !== '.js') {
          // Allow root dir itself
          if (filePath === this.rootDir) return false;
          return true;
        }
        
        // Exclude specific directories
        const parts = filePath.split(path.sep);
        const shouldExclude = excludeDirs.some(dir => parts.includes(dir));
        if (shouldExclude) return true;
        
        // Only watch TS/JS/Prisma files, allow directories to be crawled
        if (stats && stats.isFile()) {
          const ext = path.extname(filePath);
          return !['.ts', '.tsx', '.js', '.jsx', '.prisma'].includes(ext);
        }
        
        return false;
      },
      persistent: true,
      ignoreInitial: true, // Don't trigger 'add' on startup, indexing is handled in scanDirectory
    });

    this.watcher
      .on('add', (filePath) => {
        const normalized = filePath.replace(/\\/g, '/');
        console.log(`[Watcher] File added: ${path.relative(this.rootDir, normalized)}`);
        this.indexer.indexFile(normalized, this.rootDir);
      })
      .on('change', (filePath) => {
        const normalized = filePath.replace(/\\/g, '/');
        console.log(`[Watcher] File changed: ${path.relative(this.rootDir, normalized)}`);
        const updated = this.indexer.indexFile(normalized, this.rootDir);
        if (updated) {
          console.log(`[Watcher] Updated index for: ${path.relative(this.rootDir, normalized)}`);
        }
      })
      .on('unlink', (filePath) => {
        const normalized = filePath.replace(/\\/g, '/');
        console.log(`[Watcher] File deleted: ${path.relative(this.rootDir, normalized)}`);
        this.indexer.deleteFile(normalized);
      });

    console.log(`[Watcher] File system watching started in: ${this.rootDir}`);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      console.log('[Watcher] File system watching stopped.');
    }
  }
}
