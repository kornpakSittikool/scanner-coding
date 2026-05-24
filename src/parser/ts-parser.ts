import { Project, SyntaxKind, ClassDeclaration, Decorator, PropertyDeclaration, VariableDeclaration, SourceFile } from 'ts-morph';
import * as path from 'path';

export interface ParsedSymbol {
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
  signature: string;
  docstring: string | null;
}

export interface ParsedDbSchema {
  entityName: string;
  dbType: string; // 'typeorm' | 'mongoose'
  schemaJson: string;
}

export interface ParsedRelation {
  fromName: string;
  toName: string;
  type: string; // 'calls' | 'extends' | 'implements' | 'imports' | 'db_relation'
}

export interface ParsedFileResult {
  symbols: ParsedSymbol[];
  dbSchemas: ParsedDbSchema[];
  relations: ParsedRelation[];
}

export class CodeParser {
  private project: Project;

  constructor() {
    this.project = new Project({
      compilerOptions: {
        allowJs: true,
        experimentalDecorators: true,
      }
    });
  }

  parseFile(filepath: string, rootDir: string): ParsedFileResult {
    const relativePath = path.relative(rootDir, filepath).replace(/\\/g, '/');
    let sourceFile = this.project.getSourceFile(filepath);
    if (sourceFile) {
      sourceFile.refreshFromFileSystemSync();
    } else {
      sourceFile = this.project.addSourceFileAtPathIfExists(filepath);
    }
    
    if (!sourceFile) {
      return { symbols: [], dbSchemas: [], relations: [] };
    }

    const symbols: ParsedSymbol[] = [];
    const dbSchemas: ParsedDbSchema[] = [];
    const relations: ParsedRelation[] = [];

    // 1. Parse Classes
    const classes = sourceFile.getClasses();
    for (const cls of classes) {
      const className = cls.getName() || 'AnonymousClass';
      const startLine = cls.getStartLineNumber();
      const endLine = cls.getEndLineNumber();
      
      // Determine kind based on decorators & name
      let kind = 'class';
      const decorators = cls.getDecorators();
      const decoratorNames = decorators.map(d => d.getName());
      
      if (decoratorNames.includes('Entity') || decoratorNames.includes('ChildEntity')) {
        kind = 'entity';
        this.parseTypeOrmEntity(cls, dbSchemas, relativePath);
      } else if (decoratorNames.includes('Schema') && decoratorNames.includes('Injectable') === false) {
        // NestJS Mongoose Schema
        kind = 'mongoose-schema-class';
        this.parseNestMongooseSchema(cls, dbSchemas);
      } else if (decoratorNames.includes('Controller')) {
        kind = 'nestjs-controller';
      } else if (decoratorNames.includes('Injectable')) {
        kind = 'nestjs-service';
      } else if (decoratorNames.includes('Component')) {
        kind = 'angular-component';
      } else if (decoratorNames.includes('Injectable') === false && className.endsWith('Component')) {
        kind = 'react-component'; // Fallback detection
      }

      // Generate class signature
      const signature = cls.getText().split('{')[0].trim();
      const docstring = this.getJsDocText(cls);

      symbols.push({
        name: className,
        kind,
        startLine,
        endLine,
        signature,
        docstring
      });

      // Parse methods in class
      const methods = cls.getMethods();
      for (const method of methods) {
        const methodName = method.getName();
        let methodKind = 'method';
        
        const mDecorators = method.getDecorators();
        const mDecNames = mDecorators.map(d => d.getName());
        const httpMethods = ['Get', 'Post', 'Put', 'Delete', 'Patch', 'Options', 'Head'];
        const matchedHttpMethod = mDecNames.find(name => httpMethods.includes(name));
        
        if (matchedHttpMethod) {
          methodKind = `http-route-${matchedHttpMethod.toLowerCase()}`;
        }

        symbols.push({
          name: `${className}.${methodName}`,
          kind: methodKind,
          startLine: method.getStartLineNumber(),
          endLine: method.getEndLineNumber(),
          signature: method.getText().split('{')[0].trim(),
          docstring: this.getJsDocText(method)
        });
      }

      // Parse inheritance & implementation relations
      const baseClass = cls.getBaseClass();
      if (baseClass) {
        const baseName = baseClass.getName();
        if (baseName) {
          relations.push({
            fromName: className,
            toName: baseName,
            type: 'extends'
          });
        }
      }

      const interfaces = cls.getImplements();
      for (const itf of interfaces) {
        const itfName = itf.getExpression().getText();
        relations.push({
          fromName: className,
          toName: itfName,
          type: 'implements'
        });
      }
    }

    // 2. Parse Interfaces
    const interfaces = sourceFile.getInterfaces();
    for (const itf of interfaces) {
      const itfName = itf.getName();
      symbols.push({
        name: itfName,
        kind: 'interface',
        startLine: itf.getStartLineNumber(),
        endLine: itf.getEndLineNumber(),
        signature: itf.getText().split('{')[0].trim(),
        docstring: this.getJsDocText(itf)
      });
    }

    // 3. Parse Functions
    const functions = sourceFile.getFunctions();
    for (const fn of functions) {
      const fnName = fn.getName();
      if (!fnName) continue;
      
      let kind = 'function';
      // React Component detection: Capital letter & looks like jsx/tsx return
      const isCapitalized = fnName[0] === fnName[0].toUpperCase();
      if (isCapitalized && (filepath.endsWith('.tsx') || filepath.endsWith('.jsx'))) {
        kind = 'react-component';
      }

      symbols.push({
        name: fnName,
        kind,
        startLine: fn.getStartLineNumber(),
        endLine: fn.getEndLineNumber(),
        signature: fn.getText().split('{')[0].trim(),
        docstring: this.getJsDocText(fn)
      });
    }

    // 4. Parse Variable Declarations (Express routes, Mongoose schemas)
    const varDecls = sourceFile.getVariableDeclarations();
    for (const decl of varDecls) {
      const name = decl.getName();
      const initializer = decl.getInitializer();
      if (!initializer) continue;
      
      const initText = initializer.getText();
      
      // Look for Mongoose schema creation: new Schema({ ... })
      if (initText.includes('new Schema') || initText.includes('new mongoose.Schema') || initText.includes('mongoose.model')) {
        this.parseMongooseSchema(decl, dbSchemas);
        
        symbols.push({
          name,
          kind: 'mongoose-schema',
          startLine: decl.getStartLineNumber(),
          endLine: decl.getEndLineNumber(),
          signature: `const ${name} = Schema({...})`,
          docstring: null
        });
      }
      
      // React Arrow Function components
      const isCapitalized = name[0] === name[0].toUpperCase();
      if (isCapitalized && (filepath.endsWith('.tsx') || filepath.endsWith('.jsx')) && (initText.includes('=>') || initText.includes('function'))) {
        symbols.push({
          name,
          kind: 'react-component',
          startLine: decl.getStartLineNumber(),
          endLine: decl.getEndLineNumber(),
          signature: `const ${name} = ...`,
          docstring: this.getJsDocText(decl)
        });
      }

      // Express Routes detection: e.g. router.get('/path', ...) or app.post(...)
      if (initText.includes('express.Router()') || name === 'app' || name === 'router') {
        // Find method calls on this variable in the file
        // We will scan call expressions in the file
        // e.g. router.get('/path', ...)
      }
    }

    // Parse express routing calls directly in the source file
    this.parseExpressRoutes(sourceFile, symbols);

    // Clean up ts-morph memory cache
    this.project.removeSourceFile(sourceFile);

    return { symbols, dbSchemas, relations };
  }

  // --- Helper: TypeORM Entity Parser ---
  private parseTypeOrmEntity(cls: ClassDeclaration, dbSchemas: ParsedDbSchema[], filepath: string) {
    const entityName = cls.getName() || 'AnonymousEntity';
    
    // Get table name if specified in @Entity('table_name')
    let tableName = entityName.toLowerCase();
    const entityDec = cls.getDecorator('Entity');
    if (entityDec) {
      const args = entityDec.getArguments();
      if (args.length > 0) {
        const argText = args[0].getText();
        // Strip quotes
        tableName = argText.replace(/['"`]/g, '');
      }
    }

    const columns: any[] = [];
    const relations: any[] = [];

    const properties = cls.getProperties();
    for (const prop of properties) {
      const name = prop.getName();
      const type = prop.getType().getText();
      const pDecorators = prop.getDecorators();
      const pDecNames = pDecorators.map(d => d.getName());

      // Check if it's a relation
      const relDecName = pDecNames.find(name => 
        ['ManyToOne', 'OneToMany', 'ManyToMany', 'OneToOne'].includes(name)
      );

      if (relDecName) {
        const dec = prop.getDecorator(relDecName);
        let targetEntity = 'Unknown';
        if (dec) {
          const args = dec.getArguments();
          if (args.length > 0) {
            // Usually returns a lambda like type => Post or "Post"
            const argText = args[0].getText();
            targetEntity = argText.split('=>').pop()?.trim() || argText;
            targetEntity = targetEntity.replace(/['"`()]/g, '');
          }
        }
        
        relations.push({
          fieldName: name,
          relationType: relDecName,
          targetEntity,
          type
        });
      } else {
        // Standard column
        const isPrimary = pDecNames.some(name => 
          ['PrimaryColumn', 'PrimaryGeneratedColumn'].includes(name)
        );
        
        const colDec = pDecorators.find(d => ['Column', 'PrimaryColumn', 'PrimaryGeneratedColumn', 'CreateDateColumn', 'UpdateDateColumn'].includes(d.getName()));
        let columnType = type;
        let isNullable = true;
        let isUnique = false;

        if (colDec) {
          const args = colDec.getArguments();
          if (args.length > 0) {
            // Check if options object or type is passed
            const argText = args[0].getText();
            if (argText.startsWith('{')) {
              // Parse options roughly (e.g. nullable: true, unique: true, type: 'varchar')
              isNullable = !argText.includes('nullable: false');
              isUnique = argText.includes('unique: true');
              const typeMatch = argText.match(/type:\s*['"]([^'"]+)['"]/);
              if (typeMatch) columnType = typeMatch[1];
            } else {
              // Probably raw type like 'varchar'
              columnType = argText.replace(/['"`]/g, '');
            }
          }
        }

        columns.push({
          name,
          type: columnType,
          isPrimary,
          isNullable,
          isUnique
        });
      }
    }

    dbSchemas.push({
      entityName,
      dbType: 'typeorm',
      schemaJson: JSON.stringify({
        tableName,
        columns,
        relations,
        filepath
      }, null, 2)
    });
  }

  // --- Helper: NestJS Mongoose Schema Parser ---
  private parseNestMongooseSchema(cls: ClassDeclaration, dbSchemas: ParsedDbSchema[]) {
    const entityName = cls.getName() || 'AnonymousMongooseSchema';
    const columns: any[] = [];

    const properties = cls.getProperties();
    for (const prop of properties) {
      const name = prop.getName();
      const type = prop.getType().getText();
      const propDec = prop.getDecorator('Prop');

      if (propDec) {
        let isRequired = false;
        let isUnique = false;
        let propType = type;

        const args = propDec.getArguments();
        if (args.length > 0) {
          const argText = args[0].getText();
          isRequired = argText.includes('required: true');
          isUnique = argText.includes('unique: true');
          const typeMatch = argText.match(/type:\s*([^,}]+)/);
          if (typeMatch) {
            propType = typeMatch[1].trim().replace(/['"`]/g, '');
          }
        }

        columns.push({
          name,
          type: propType,
          isRequired,
          isUnique
        });
      }
    }

    dbSchemas.push({
      entityName,
      dbType: 'mongoose',
      schemaJson: JSON.stringify({
        collectionName: `${entityName.toLowerCase()}s`,
        columns
      }, null, 2)
    });
  }

  // --- Helper: Standard Mongoose Schema Parser ---
  private parseMongooseSchema(decl: VariableDeclaration, dbSchemas: ParsedDbSchema[]) {
    const schemaName = decl.getName();
    const entityName = schemaName.replace('Schema', '');
    const columns: any[] = [];
    const initializer = decl.getInitializer();
    if (!initializer) return;

    // Scan for schema fields
    // We do a simple structural regex/text analysis of the object argument
    const text = initializer.getText();
    const schemaBodyMatch = text.match(/Schema\s*\(\s*({[\s\S]+?})\s*[,)]/);
    
    if (schemaBodyMatch) {
      try {
        // Rough parse properties in schema object
        // Example schema structure: name: { type: String, required: true }, email: String
        // Let's parse line by line
        const body = schemaBodyMatch[1];
        const lines = body.split('\n');
        for (const line of lines) {
          const match = line.match(/^\s*([a-zA-Z0-9_]+)\s*:\s*(.+),?\s*$/);
          if (match) {
            const fieldName = match[1];
            const fieldVal = match[2].trim();
            
            let type = 'Mixed';
            let isRequired = false;
            let isUnique = false;

            if (fieldVal.startsWith('{')) {
              // It's a configuration object
              isRequired = fieldVal.includes('required: true');
              isUnique = fieldVal.includes('unique: true');
              const typeMatch = fieldVal.match(/type\s*:\s*([a-zA-Z0-9_.[\]]+)/);
              if (typeMatch) {
                type = typeMatch[1];
              }
            } else {
              // Simple type declaration like field: String
              type = fieldVal.replace(/,$/, '');
            }

            columns.push({
              name: fieldName,
              type,
              isRequired,
              isUnique
            });
          }
        }
      } catch (e) {
        // Fallback for parsing error
      }
    }

    dbSchemas.push({
      entityName: entityName || schemaName,
      dbType: 'mongoose',
      schemaJson: JSON.stringify({
        collectionName: `${(entityName || schemaName).toLowerCase()}s`,
        columns
      }, null, 2)
    });
  }

  // --- Helper: Express Routes Parser ---
  private parseExpressRoutes(sourceFile: SourceFile, symbols: ParsedSymbol[]) {
    const callExprs = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of callExprs) {
      const expression = call.getExpression();
      const expText = expression.getText();
      
      // Look for app.get, router.post, etc.
      // Format: app.get('/path', ...) or router.post('/path', ...)
      const routeMatch = expText.match(/^(app|router|route)\.(get|post|put|delete|patch)$/i);
      if (routeMatch) {
        const method = routeMatch[2].toUpperCase();
        const args = call.getArguments();
        if (args.length > 0) {
          const routePathArg = args[0];
          // Check if path is string literal
          if (routePathArg.getKind() === SyntaxKind.StringLiteral || routePathArg.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
            const routePath = routePathArg.getText().replace(/['"`]/g, '');
            const startLine = call.getStartLineNumber();
            const endLine = call.getEndLineNumber();
            
            symbols.push({
              name: `${method} ${routePath}`,
              kind: `express-route-${method.toLowerCase()}`,
              startLine,
              endLine,
              signature: `${method} ${routePath}`,
              docstring: null
            });
          }
        }
      }
    }
  }

  // --- Helper: Get JS Doc / Comment Block ---
  private getJsDocText(node: any): string | null {
    try {
      if (typeof node.getJsDocs === 'function') {
        const jsDocs = node.getJsDocs();
        if (jsDocs.length > 0) {
          return jsDocs.map((d: any) => d.getDescription().trim()).join('\n');
        }
      }
      // Fallback: search leading comments
      const leadingCommentRanges = node.getLeadingCommentRanges();
      if (leadingCommentRanges.length > 0) {
        return leadingCommentRanges
          .map((r: any) => {
            const text = r.getText();
            return text
              .replace(/^\/\*\*?/, '')
              .replace(/\*\/$/, '')
              .replace(/^\s*\*\s?/gm, '')
              .trim();
          })
          .join('\n')
          .trim();
      }
    } catch (e) {
      // Ignore
    }
    return null;
  }
}
