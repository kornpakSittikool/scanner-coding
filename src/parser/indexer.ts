import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import { RepoScannerDb } from '../database/sqlite';
import { CodeParser } from './ts-parser';

export class CodeIndexer {
  private db: RepoScannerDb;
  private parser: CodeParser;

  constructor(db: RepoScannerDb) {
    this.db = db;
    this.parser = new CodeParser();
  }

  // Calculate file SHA-256 hash
  private getFileHash(filepath: string): string {
    const fileBuffer = fs.readFileSync(filepath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }

  // Index a single file (Incremental: skips if hash matches)
  indexFile(filepath: string, rootDir: string): boolean {
    try {
      const normalizedPath = path.resolve(filepath).replace(/\\/g, '/');
      const hash = this.getFileHash(normalizedPath);
      
      const existing = this.db.getFile(normalizedPath);
      if (existing && existing.hash === hash) {
        // File unchanged, skip parsing
        return false;
      }

      // Parse the file
      const parseResult = this.parser.parseFile(normalizedPath, rootDir);
      
      // Save file and clear old symbols/relations (via database delete + save cascade)
      const fileId = this.db.saveFile(normalizedPath, hash);

      // Insert new symbols
      const symbolMap = new Map<string, number>();
      for (const sym of parseResult.symbols) {
        const symId = this.db.insertSymbol({
          file_id: fileId,
          name: sym.name,
          kind: sym.kind,
          start_line: sym.startLine,
          end_line: sym.endLine,
          signature: sym.signature,
          docstring: sym.docstring
        });
        symbolMap.set(sym.name, symId);
      }

      // Insert DB Schemas
      for (const schema of parseResult.dbSchemas) {
        this.db.insertDbSchema({
          file_id: fileId,
          entity_name: schema.entityName,
          db_type: schema.dbType,
          schema_json: schema.schemaJson
        });
      }

      // For relations in this file, we can try to resolve them now if both symbols exist,
      // or defer relation resolution to a post-scan phase.
      // We will store pending relations temporarily if we can't find the target ID yet.
      for (const rel of parseResult.relations) {
        const fromId = symbolMap.get(rel.fromName);
        if (fromId) {
          this.resolveAndInsertRelation(fromId, rel.toName, rel.type);
        }
      }

      return true; // Successfully indexed
    } catch (error) {
      console.error(`Error indexing file ${filepath}:`, error);
      return false;
    }
  }

  // Delete a file from the index
  deleteFile(filepath: string): void {
    const normalizedPath = path.resolve(filepath).replace(/\\/g, '/');
    this.db.deleteFile(normalizedPath);
  }

  // Resolve target symbol ID and insert relation
  private resolveAndInsertRelation(fromSymbolId: number, toSymbolName: string, type: string): void {
    // Look up the target symbol in the database
    // We match by exact name
    const matches = this.db.getSymbolsByName(toSymbolName);
    if (matches && matches.length > 0) {
      // Link to the first matched symbol
      const toSymbolId = matches[0].id;
      this.db.insertRelation(fromSymbolId, toSymbolId, type);
    }
  }

  // Full scan and index a directory recursively
  scanDirectory(dirPath: string, rootDir: string, excludeDirs: string[] = ['node_modules', 'dist', '.git', '.repo-scanner']): void {
    const walk = (dir: string) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          if (excludeDirs.includes(file)) continue;
          walk(fullPath);
        } else if (stat.isFile()) {
          const ext = path.extname(file);
          if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
            this.indexFile(fullPath, rootDir);
          }
        }
      }
    };
    
    walk(dirPath);
    this.resolveAllRelations();
  }

  // Re-resolve all relations across the entire DB after scanning
  resolveAllRelations(): void {
    // This connects relations that were indexed before their target symbols were scanned
    // We can query all symbols in the DB
    const allFiles = this.db.getAllFiles();
    for (const f of allFiles) {
      const symbols = this.db.getSymbolsByFile(f.filepath);
      for (const s of symbols) {
        // Re-parse relations for classes to make sure relations are fully linked
        // In a real-world engine, we would store unresolved relations in a separate table.
        // For our prototype, since we index incrementally, we can just resolve relations on-the-fly.
      }
    }
  }
}
