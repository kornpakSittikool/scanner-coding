import express from 'express';
import { RepoScannerDb } from '../database/sqlite';
import * as path from 'path';

export function startServer(db: RepoScannerDb, port: number = 9876): any {
  const app = express();
  app.use(express.json());

  // Helper: Format DB schemas into high-density flat text to save tokens
  function formatDbSchemaCompact(schema: any): string {
    try {
      const data = JSON.parse(schema.schema_json);
      const dbType = schema.db_type.toUpperCase();
      let output = `=== ${dbType} Entity: ${schema.entity_name} (File: ${path.basename(schema.filepath)}) ===\n`;
      
      if (data.tableName) output += `Table: ${data.tableName}\n`;
      if (data.collectionName) output += `Collection: ${data.collectionName}\n`;
      
      output += `Fields:\n`;
      if (data.columns && Array.isArray(data.columns)) {
        for (const col of data.columns) {
          const attributes = [];
          if (col.isPrimary) attributes.push('PK');
          if (col.isRequired || col.isNullable === false) attributes.push('NotNull');
          if (col.isUnique) attributes.push('Unique');
          
          const attrStr = attributes.length > 0 ? ` (${attributes.join(', ')})` : '';
          output += `  - ${col.name}: ${col.type}${attrStr}\n`;
        }
      }
      
      if (data.relations && Array.isArray(data.relations) && data.relations.length > 0) {
        output += `Relations:\n`;
        for (const rel of data.relations) {
          output += `  - ${rel.fieldName}: ${rel.relationType} -> ${rel.targetEntity}\n`;
        }
      }
      
      return output;
    } catch (e) {
      return `Entity: ${schema.entity_name} (JSON parse error)\n`;
    }
  }

  // Helper: Format symbols into signature-only typescript declaration code to save tokens
  function formatSymbolsCompact(symbols: any[], filepath: string): string {
    const relativePath = filepath.replace(/\\/g, '/');
    let output = `// File: ${relativePath}\n`;
    
    // Group symbols by class
    const classes = symbols.filter(s => ['class', 'entity', 'mongoose-schema-class', 'nestjs-controller', 'nestjs-service', 'angular-component'].includes(s.kind));
    const standaloneFunctions = symbols.filter(s => s.kind === 'function' || s.kind === 'react-component');
    const interfaces = symbols.filter(s => s.kind === 'interface');
    
    // Format Interfaces
    for (const itf of interfaces) {
      if (itf.docstring) {
        output += `/**\n * ${itf.docstring.split('\n').join('\n * ')}\n */\n`;
      }
      output += `${itf.signature} {\n  // Interface properties\n}\n\n`;
    }

    // Format Classes with methods nested inside
    for (const cls of classes) {
      if (cls.docstring) {
        output += `/**\n * ${cls.docstring.split('\n').join('\n * ')}\n */\n`;
      }
      
      output += `${cls.signature} {\n`;
      
      // Find methods for this class (they are stored with name "ClassName.methodName")
      const methods = symbols.filter(s => s.name.startsWith(`${cls.name}.`));
      for (const m of methods) {
        const methodName = m.name.substring(cls.name.length + 1);
        
        // Indent methods inside class
        if (m.docstring) {
          output += `  /**\n   * ${m.docstring.split('\n').join('\n   * ')}\n   */\n`;
        }
        output += `  ${m.signature};\n`;
      }
      
      output += `}\n\n`;
    }

    // Format Standalone Functions
    for (const fn of standaloneFunctions) {
      if (fn.docstring) {
        output += `/**\n * ${fn.docstring.split('\n').join('\n * ')}\n */\n`;
      }
      output += `${fn.signature};\n\n`;
    }

    return output.trim();
  }

  // 1. GET /api/db-schemas: returns high-density compact DB schema
  app.get('/api/db-schemas', (req, res) => {
    const rawSchemas = db.getAllDbSchemas();
    
    if (req.query.format === 'json') {
      return res.json(rawSchemas);
    }
    
    // Default: Return high-density compact text to save tokens
    const textOutput = rawSchemas.map(formatDbSchemaCompact).join('\n---\n\n');
    res.type('text/plain').send(textOutput || 'No DB Schemas found in this workspace.');
  });

  // 2. GET /api/symbols: search symbols by name
  app.get('/api/symbols', (req, res) => {
    const name = req.query.name as string;
    if (!name) {
      return res.status(400).json({ error: 'Missing name query parameter' });
    }
    
    const results = db.getSymbolsByName(name);
    
    if (req.query.format === 'json') {
      return res.json(results);
    }
    
    // Group search results by file, and print stubs
    const filesMap = new Map<string, any[]>();
    for (const row of results) {
      const list = filesMap.get(row.filepath) || [];
      list.push(row);
      filesMap.set(row.filepath, list);
    }
    
    let textOutput = `Search results for: "${name}"\n\n`;
    for (const [filepath, fileSymbols] of filesMap.entries()) {
      // Get all symbols in this file to construct full class structure context
      const fileAllSymbols = db.getSymbolsByFile(filepath);
      textOutput += formatSymbolsCompact(fileAllSymbols, filepath) + '\n\n=========================================\n\n';
    }
    
    res.type('text/plain').send(textOutput || 'No symbols found matching the search term.');
  });

  // 3. GET /api/symbols/file: retrieve all symbols in a file
  app.get('/api/symbols/file', (req, res) => {
    const filepath = req.query.path as string;
    if (!filepath) {
      return res.status(400).json({ error: 'Missing path query parameter' });
    }
    
    const absolutePath = path.resolve(filepath).replace(/\\/g, '/');
    const symbols = db.getSymbolsByFile(absolutePath);
    
    if (symbols.length === 0) {
      return res.status(404).send(`No symbols indexed for file: ${filepath}`);
    }
    
    if (req.query.format === 'json') {
      return res.json(symbols);
    }
    
    const textOutput = formatSymbolsCompact(symbols, absolutePath);
    res.type('text/plain').send(textOutput);
  });

  // 4. GET /api/relations: returns symbol connections
  app.get('/api/relations', (req, res) => {
    const relations = db.getRelations();
    
    if (req.query.format === 'json') {
      return res.json(relations);
    }
    
    // Format compact text
    let output = '=== Codebase Relations & Call Graph ===\n';
    for (const r of relations) {
      output += `${r.from_name} [${r.from_kind}] --(${r.type})--> ${r.to_name} [${r.to_kind}]\n`;
    }
    res.type('text/plain').send(output || 'No relations indexed in this workspace.');
  });

  // 5. GET /api/files: returns all indexed files
  app.get('/api/files', (req, res) => {
    const files = db.getAllFiles();
    res.json(files);
  });

  const server = app.listen(port, () => {
    console.log(`[HTTP Server] RepoScanner API running at http://localhost:${port}`);
  }).on('error', (err: any) => {
    console.error(`[HTTP Server] Failed to start server on port ${port}:`, err.message);
  });

  return server;
}
