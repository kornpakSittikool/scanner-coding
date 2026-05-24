import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RepoScannerDb } from './database/sqlite';
import { CodeIndexer } from './parser/indexer';
import { FileWatcher } from './watcher/file-watcher';
import { startServer } from './server/app';
import { RepoScannerProvider } from './ui/sidebar';
import { generateBlueprint } from './parser/blueprint';

let dbInstance: RepoScannerDb | null = null;
let watcherInstance: FileWatcher | null = null;
let serverInstance: any = null;
let blueprintTimeout: NodeJS.Timeout | null = null;

// Helper: Automatically detect framework cache directories to exclude
function detectFrameworkExclusions(rootDir: string, defaultExcludes: string[]): string[] {
  const excludes = new Set(defaultExcludes);
  
  // Angular
  if (fs.existsSync(path.join(rootDir, 'angular.json')) || fs.existsSync(path.join(rootDir, '.angular'))) {
    excludes.add('.angular');
  }
  // Next.js
  if (fs.existsSync(path.join(rootDir, 'next.config.js')) || 
      fs.existsSync(path.join(rootDir, 'next.config.mjs')) || 
      fs.existsSync(path.join(rootDir, 'next.config.ts')) || 
      fs.existsSync(path.join(rootDir, '.next'))) {
    excludes.add('.next');
  }
  // Nuxt.js
  if (fs.existsSync(path.join(rootDir, 'nuxt.config.js')) || 
      fs.existsSync(path.join(rootDir, 'nuxt.config.ts')) || 
      fs.existsSync(path.join(rootDir, '.nuxt'))) {
    excludes.add('.nuxt');
  }
  // SvelteKit
  if (fs.existsSync(path.join(rootDir, '.svelte-kit'))) {
    excludes.add('.svelte-kit');
  }
  
  return Array.from(excludes);
}

// Helper: Automatically update AI_BLUEPRINT.md with debouncing
function triggerAutoBlueprint(db: RepoScannerDb, rootDir: string) {
  if (blueprintTimeout) {
    clearTimeout(blueprintTimeout);
  }
  
  blueprintTimeout = setTimeout(() => {
    try {
      const mdContent = generateBlueprint(db, rootDir);
      const outputPath = path.join(rootDir, 'AI_BLUEPRINT.md');
      fs.writeFileSync(outputPath, mdContent, 'utf8');
      console.log('[RepoScanner] AI_BLUEPRINT.md updated automatically.');
    } catch (e) {
      console.error(`[RepoScanner] Failed to auto-update blueprint: ${e}`);
    }
    blueprintTimeout = null;
  }, 1000); // 1 second debounce
}

export function activate(context: vscode.ExtensionContext) {
  console.log('[RepoScanner] Extension activating...');

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    console.log('[RepoScanner] No workspace open. Scanner disabled.');
    return;
  }

  const rootDir = workspaceFolders[0].uri.fsPath.replace(/\\/g, '/');
  const scannerDir = path.join(rootDir, '.repo-scanner').replace(/\\/g, '/');
  const dbPath = path.join(scannerDir, 'index.json').replace(/\\/g, '/'); // Sync to .json database

  // Ensure metadata folder exists
  if (!fs.existsSync(scannerDir)) {
    fs.mkdirSync(scannerDir, { recursive: true });
  }

  // Load configuration & Auto-detect exclusions
  let port = 9876;
  let baseExclude = ['node_modules', 'dist', '.git', '.repo-scanner'];
  let exclude = detectFrameworkExclusions(rootDir, baseExclude);
  const configPath = path.join(scannerDir, 'config.json');
  
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ port, exclude }, null, 2)
    );
  } else {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.port) port = Number(config.port);
      // Auto-detect and merge new exclusions to config
      const loadedExclude = config.exclude || [];
      const mergedExclude = Array.from(new Set([...loadedExclude, ...exclude]));
      exclude = mergedExclude;
      
      // Save merged exclusions back to config
      fs.writeFileSync(configPath, JSON.stringify({ port, exclude: mergedExclude }, null, 2));
    } catch (e) {
      // Keep defaults on parse error
    }
  }

  // Initialize Modules
  dbInstance = new RepoScannerDb(dbPath);
  const indexer = new CodeIndexer(dbInstance);

  // Initialize UI Provider
  const sidebarProvider = new RepoScannerProvider();
  sidebarProvider.setDatabase(dbInstance, port);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('repo-scanner-view', sidebarProvider)
  );

  // Run initial scan in the background
  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "RepoScanner: สแกนโค้ดเบสและโครงสร้างฐานข้อมูล...",
    cancellable: false
  }, async (progress) => {
    return new Promise<void>((resolve) => {
      // Run indexing
      indexer.scanDirectory(rootDir, rootDir, exclude);
      sidebarProvider.refresh();
      
      // Generate blueprint automatically on startup
      if (dbInstance) {
        triggerAutoBlueprint(dbInstance, rootDir);
      }
      resolve();
    });
  });

  // Start file system watcher
  watcherInstance = new FileWatcher(indexer, rootDir);
  watcherInstance.start(exclude);

  // Start HTTP API server
  try {
    serverInstance = startServer(dbInstance, port);
  } catch (e: any) {
    console.error('[RepoScanner] Failed to start HTTP server:', e.message);
  }

  // Hook into file saving to refresh UI and update blueprint automatically
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const ext = path.extname(doc.fileName);
      if (['.ts', '.tsx', '.js', '.jsx', '.prisma'].includes(ext)) {
        setTimeout(() => {
          sidebarProvider.refresh();
          if (dbInstance) {
            triggerAutoBlueprint(dbInstance, rootDir);
          }
        }, 500);
      }
    })
  );

  // --- Commands Registration ---

  // 1. Generate Blueprint manually
  const generateBlueprintCmd = vscode.commands.registerCommand('repo-scanner.generateBlueprint', () => {
    if (!dbInstance) {
      vscode.window.showErrorMessage('ฐานข้อมูลยังไม่ได้เชื่อมต่อ');
      return;
    }
    
    try {
      const mdContent = generateBlueprint(dbInstance, rootDir);
      const outputPath = path.join(rootDir, 'AI_BLUEPRINT.md');
      fs.writeFileSync(outputPath, mdContent);
      
      vscode.window.showInformationMessage(`เจนลายแทงสำเร็จที่: ${outputPath}`, 'เปิดไฟล์').then(selection => {
        if (selection === 'เปิดไฟล์') {
          vscode.workspace.openTextDocument(outputPath).then(doc => {
            vscode.window.showTextDocument(doc);
          });
        }
      });
      sidebarProvider.refresh();
    } catch (e) {
      vscode.window.showErrorMessage(`ไม่สามารถสร้างลายแทงได้: ${e}`);
    }
  });
  context.subscriptions.push(generateBlueprintCmd);

  // 2. Clear Database Cache
  const clearDatabaseCmd = vscode.commands.registerCommand('repo-scanner.clearDatabase', () => {
    if (!dbInstance) return;
    
    vscode.window.showWarningMessage(
      'คุณต้องการล้างฐานข้อมูลประวัติและข้อมูลสแกนทั้งหมดของ RepoScanner ใช่หรือไม่?',
      'ใช่', 'ยกเลิก'
    ).then(selection => {
      if (selection === 'ใช่' && dbInstance) {
        dbInstance.clear();
        sidebarProvider.refresh();
        // Remove AI_BLUEPRINT.md
        const outputPath = path.join(rootDir, 'AI_BLUEPRINT.md');
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        vscode.window.showInformationMessage('ล้างฐานข้อมูลประวัติเรียบร้อยแล้ว');
      }
    });
  });
  context.subscriptions.push(clearDatabaseCmd);

  console.log('[RepoScanner] Extension activated successfully!');
}

export function deactivate() {
  console.log('[RepoScanner] Extension deactivating...');
  
  if (watcherInstance) {
    watcherInstance.stop();
  }

  if (serverInstance && typeof serverInstance.close === 'function') {
    serverInstance.close();
  }

  if (dbInstance) {
    dbInstance.close();
  }
}
