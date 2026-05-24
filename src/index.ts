import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { RepoScannerDb } from './database/sqlite';
import { CodeIndexer } from './parser/indexer';
import { FileWatcher } from './watcher/file-watcher';
import { startServer } from './server/app';
import { generateBlueprint } from './parser/blueprint';

const program = new Command();

program
  .name('repo-scanner')
  .description('Incremental Code Indexer & API Service for AI context optimization')
  .version('1.0.0');

// Get scanner directories
const getPaths = () => {
  const rootDir = process.cwd().replace(/\\/g, '/');
  const scannerDir = path.join(rootDir, '.repo-scanner');
  const dbPath = path.join(scannerDir, 'index.json');
  return { rootDir, scannerDir, dbPath };
};

// command: init
program
  .command('init')
  .description('Initialize scanner metadata directory (.repo-scanner)')
  .action(() => {
    const { scannerDir, dbPath } = getPaths();
    
    if (fs.existsSync(scannerDir)) {
      console.log(`[RepoScanner] Already initialized in: ${scannerDir}`);
      return;
    }

    fs.mkdirSync(scannerDir, { recursive: true });
    
    // Create config template
    const configPath = path.join(scannerDir, 'config.json');
    const defaultConfig = {
      port: 9876,
      exclude: ['node_modules', 'dist', '.git', '.repo-scanner']
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    
    // Initialize database
    new RepoScannerDb(dbPath).close();
    
    console.log(`[RepoScanner] Initialized successfully in: ${scannerDir}`);
  });

// command: watch
program
  .command('watch')
  .description('Scan project codebase, start file watcher daemon, and run API server')
  .option('-p, --port <number>', 'API port number', '9876')
  .action((options) => {
    const { rootDir, scannerDir, dbPath } = getPaths();

    if (!fs.existsSync(scannerDir)) {
      console.log(`[RepoScanner] Project not initialized. Running 'init' first...`);
      fs.mkdirSync(scannerDir, { recursive: true });
      fs.writeFileSync(
        path.join(scannerDir, 'config.json'),
        JSON.stringify({ port: Number(options.port), exclude: ['node_modules', 'dist', '.git', '.repo-scanner'] }, null, 2)
      );
    }

    console.log(`[RepoScanner] Running initial directory scan...`);
    const db = new RepoScannerDb(dbPath);
    const indexer = new CodeIndexer(db);

    // Read exclusions from config.json if exists
    let exclude = ['node_modules', 'dist', '.git', '.repo-scanner'];
    const configPath = path.join(scannerDir, 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.exclude) exclude = config.exclude;
      } catch (e) {
        // Ignore config parse error
      }
    }

    // Perform initial scan
    indexer.scanDirectory(rootDir, rootDir, exclude);
    console.log(`[RepoScanner] Initial scan complete.`);

    // Start file system watcher
    const watcher = new FileWatcher(indexer, rootDir);
    watcher.start(exclude);

    // Start Express API server
    const port = Number(options.port);
    const server = startServer(db, port);

    // Graceful shutdown
    const handleShutdown = () => {
      console.log('\n[RepoScanner] Shutting down daemon...');
      watcher.stop();
      server.close(() => {
        db.close();
        console.log('[RepoScanner] Cleaned up connections. Goodbye.');
        process.exit(0);
      });
    };

    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);
  });

// command: query
program
  .command('query')
  .description('Directly query database indices from terminal')
  .option('-s, --symbol <name>', 'Search symbol name')
  .option('-d, --db', 'Display database schemas')
  .option('-r, --relations', 'Display relations call graph')
  .action((options) => {
    const { scannerDir, dbPath } = getPaths();

    if (!fs.existsSync(dbPath)) {
      console.error('[RepoScanner] Error: Database file not found. Run watch or init first.');
      process.exit(1);
    }

    const db = new RepoScannerDb(dbPath);

    if (options.symbol) {
      const results = db.getSymbolsByName(options.symbol);
      console.log(`\n=== Symbol search results for "${options.symbol}" ===`);
      if (results.length === 0) console.log('No symbols found.');
      for (const r of results) {
        console.log(`- [${r.kind}] ${r.name} (File: ${path.basename(r.filepath)})`);
      }
    } else if (options.db) {
      const schemas = db.getAllDbSchemas();
      console.log(`\n=== Database Entity Schemas ===`);
      if (schemas.length === 0) console.log('No database entities indexed.');
      for (const s of schemas) {
        console.log(`\nEntity: ${s.entity_name} (${s.db_type})`);
        try {
          const body = JSON.parse(s.schema_json);
          console.log(`File: ${s.filepath}`);
          console.log(`Columns/Props:`, body.columns || body.fields);
          if (body.relations) console.log(`Relations:`, body.relations);
        } catch (e) {
          console.log(`Schema Json: ${s.schema_json}`);
        }
      }
    } else if (options.relations) {
      const relations = db.getRelations();
      console.log(`\n=== Relations Graph ===`);
      if (relations.length === 0) console.log('No relations recorded.');
      for (const r of relations) {
        console.log(`${r.from_name} [${r.from_kind}] --(${r.type})--> ${r.to_name} [${r.to_kind}]`);
      }
    } else {
      console.log('[RepoScanner] Please specify a query option: --symbol, --db, or --relations');
    }

    db.close();
  });

// command: blueprint
program
  .command('blueprint')
  .description('Generate AI codebase map/guide (AI_BLUEPRINT.md) in the project root')
  .action(() => {
    const { rootDir, dbPath } = getPaths();

    if (!fs.existsSync(dbPath)) {
      console.error('[RepoScanner] Error: Database file not found. Run watch or init first.');
      process.exit(1);
    }

    console.log('[RepoScanner] Generating AI Codebase Blueprint...');
    const db = new RepoScannerDb(dbPath);
    const mdContent = generateBlueprint(db, rootDir);
    
    const outputPath = path.join(rootDir, 'AI_BLUEPRINT.md');
    fs.writeFileSync(outputPath, mdContent);
    db.close();
    
    console.log(`[RepoScanner] AI_BLUEPRINT.md generated successfully at: ${outputPath}`);
  });

// command: clear
program
  .command('clear')
  .description('Clear all database tables and indexes')
  .action(() => {
    const { dbPath } = getPaths();
    if (fs.existsSync(dbPath)) {
      const db = new RepoScannerDb(dbPath);
      db.clear();
      db.close();
      console.log('[RepoScanner] Database tables cleared.');
    } else {
      console.log('[RepoScanner] Database does not exist.');
    }
  });

program.parse(process.argv);
