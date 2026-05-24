import * as path from 'path';
import * as fs from 'fs';

export interface FileRecord {
  id: number;
  filepath: string;
  hash: string;
  last_scanned: number;
}

export interface SymbolRecord {
  id?: number;
  file_id: number;
  name: string;
  kind: string;
  start_line: number;
  end_line: number;
  signature: string;
  docstring: string | null;
}

export interface DbSchemaRecord {
  id?: number;
  file_id: number;
  entity_name: string;
  db_type: string;
  schema_json: string;
}

export interface RelationRecord {
  from_symbol_id: number;
  to_symbol_id: number;
  type: string;
}

interface JsonDatabaseState {
  files: FileRecord[];
  symbols: Required<SymbolRecord>[];
  db_schemas: Required<DbSchemaRecord>[];
  relations: RelationRecord[];
  nextIds: {
    files: number;
    symbols: number;
    db_schemas: number;
  };
}

export class RepoScannerDb {
  private dbPath: string;
  private data: JsonDatabaseState;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor(dbPath: string) {
    // Change file extension to .json internally to represent structure correctly
    this.dbPath = dbPath.endsWith('.db') ? dbPath.replace(/\.db$/, '.json') : dbPath;
    
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.data = this.load();
  }

  private load(): JsonDatabaseState {
    if (fs.existsSync(this.dbPath)) {
      try {
        const content = fs.readFileSync(this.dbPath, 'utf8');
        return JSON.parse(content) as JsonDatabaseState;
      } catch (e) {
        console.error(`[RepoScannerDb] Failed to parse database file, resetting: ${e}`);
      }
    }
    
    const initialState: JsonDatabaseState = {
      files: [],
      symbols: [],
      db_schemas: [],
      relations: [],
      nextIds: {
        files: 1,
        symbols: 1,
        db_schemas: 1
      }
    };
    this.flushSync(initialState);
    return initialState;
  }

  private flushSync(state: JsonDatabaseState = this.data) {
    fs.writeFileSync(this.dbPath, JSON.stringify(state, null, 2), 'utf8');
  }

  private scheduleSave() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.flushSync();
      this.saveTimeout = null;
    }, 150); // Debounce write operations
  }

  // --- File operations ---
  
  getFile(filepath: string): FileRecord | null {
    const file = this.data.files.find(f => f.filepath === filepath);
    return file || null;
  }

  saveFile(filepath: string, hash: string): number {
    const existing = this.getFile(filepath);
    const now = Date.now();
    
    if (existing) {
      // Manual cascade delete
      const symbolIds = this.data.symbols.filter(s => s.file_id === existing.id).map(s => s.id);
      
      this.data.files = this.data.files.filter(f => f.id !== existing.id);
      this.data.symbols = this.data.symbols.filter(s => s.file_id !== existing.id);
      this.data.db_schemas = this.data.db_schemas.filter(d => d.file_id !== existing.id);
      this.data.relations = this.data.relations.filter(r => 
        !symbolIds.includes(r.from_symbol_id) && !symbolIds.includes(r.to_symbol_id)
      );
    }
    
    const id = this.data.nextIds.files++;
    this.data.files.push({
      id,
      filepath,
      hash,
      last_scanned: now
    });
    
    this.scheduleSave();
    return id;
  }

  deleteFile(filepath: string): void {
    const existing = this.getFile(filepath);
    if (!existing) return;
    
    const symbolIds = this.data.symbols.filter(s => s.file_id === existing.id).map(s => s.id);
    
    this.data.files = this.data.files.filter(f => f.id !== existing.id);
    this.data.symbols = this.data.symbols.filter(s => s.file_id !== existing.id);
    this.data.db_schemas = this.data.db_schemas.filter(d => d.file_id !== existing.id);
    this.data.relations = this.data.relations.filter(r => 
      !symbolIds.includes(r.from_symbol_id) && !symbolIds.includes(r.to_symbol_id)
    );
    
    this.scheduleSave();
  }

  getAllFiles(): FileRecord[] {
    return this.data.files;
  }

  // --- Symbol operations ---

  insertSymbol(symbol: SymbolRecord): number {
    const id = this.data.nextIds.symbols++;
    this.data.symbols.push({
      id,
      file_id: symbol.file_id,
      name: symbol.name,
      kind: symbol.kind,
      start_line: symbol.start_line,
      end_line: symbol.end_line,
      signature: symbol.signature,
      docstring: symbol.docstring
    });
    
    this.scheduleSave();
    return id;
  }

  getSymbolsByName(name: string): any[] {
    const nameLower = name.toLowerCase();
    return this.data.symbols
      .filter(s => s.name.toLowerCase().includes(nameLower))
      .map(s => {
        const file = this.data.files.find(f => f.id === s.file_id);
        return {
          ...s,
          filepath: file ? file.filepath : ''
        };
      });
  }

  getSymbolsByFile(filepath: string): any[] {
    const file = this.data.files.find(f => f.filepath === filepath);
    if (!file) return [];
    return this.data.symbols.filter(s => s.file_id === file.id);
  }

  // --- DB Schema operations ---

  insertDbSchema(schema: DbSchemaRecord): void {
    const id = this.data.nextIds.db_schemas++;
    this.data.db_schemas.push({
      id,
      file_id: schema.file_id,
      entity_name: schema.entity_name,
      db_type: schema.db_type,
      schema_json: schema.schema_json
    });
    
    this.scheduleSave();
  }

  getAllDbSchemas(): any[] {
    return this.data.db_schemas.map(d => {
      const file = this.data.files.find(f => f.id === d.file_id);
      return {
        ...d,
        filepath: file ? file.filepath : ''
      };
    });
  }

  // --- Relation operations ---

  insertRelation(fromId: number, toId: number, type: string): void {
    const exists = this.data.relations.some(r => 
      r.from_symbol_id === fromId && r.to_symbol_id === toId && r.type === type
    );
    if (exists) return;
    
    this.data.relations.push({
      from_symbol_id: fromId,
      to_symbol_id: toId,
      type
    });
    
    this.scheduleSave();
  }

  getRelations(): any[] {
    return this.data.relations.map(r => {
      const fromSymbol = this.data.symbols.find(s => s.id === r.from_symbol_id);
      const toSymbol = this.data.symbols.find(s => s.id === r.to_symbol_id);
      if (!fromSymbol || !toSymbol) return null;
      
      const fromFile = this.data.files.find(f => f.id === fromSymbol.file_id);
      const toFile = this.data.files.find(f => f.id === toSymbol.file_id);
      
      return {
        from_name: fromSymbol.name,
        from_kind: fromSymbol.kind,
        from_filepath: fromFile ? fromFile.filepath : '',
        to_name: toSymbol.name,
        to_kind: toSymbol.kind,
        to_filepath: toFile ? toFile.filepath : '',
        type: r.type
      };
    }).filter(Boolean);
  }

  // --- Utility ---

  clear(): void {
    this.data.files = [];
    this.data.symbols = [];
    this.data.db_schemas = [];
    this.data.relations = [];
    this.data.nextIds = {
      files: 1,
      symbols: 1,
      db_schemas: 1
    };
    this.flushSync();
  }

  close(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.flushSync();
  }
}
