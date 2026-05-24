export const CREATE_FILES_TABLE = `
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filepath TEXT UNIQUE NOT NULL,
    hash TEXT NOT NULL,
    last_scanned INTEGER NOT NULL
  );
`;

export const CREATE_SYMBOLS_TABLE = `
  CREATE TABLE IF NOT EXISTS symbols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    signature TEXT NOT NULL,
    docstring TEXT,
    FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
  );
`;

export const CREATE_DB_SCHEMAS_TABLE = `
  CREATE TABLE IF NOT EXISTS db_schemas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    entity_name TEXT NOT NULL,
    db_type TEXT NOT NULL,
    schema_json TEXT NOT NULL,
    FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
  );
`;

export const CREATE_RELATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS relations (
    from_symbol_id INTEGER NOT NULL,
    to_symbol_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    PRIMARY KEY (from_symbol_id, to_symbol_id, type),
    FOREIGN KEY(from_symbol_id) REFERENCES symbols(id) ON DELETE CASCADE,
    FOREIGN KEY(to_symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
  );
`;

export const CREATE_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_files_filepath ON files(filepath);
  CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
  CREATE INDEX IF NOT EXISTS idx_symbols_file_id ON symbols(file_id);
  CREATE INDEX IF NOT EXISTS idx_db_schemas_entity ON db_schemas(entity_name);
  CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_symbol_id);
  CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_symbol_id);
`;
