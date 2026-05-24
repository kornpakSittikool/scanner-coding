# 🗺️ AI Codebase Blueprint (ลายแทงโครงสร้างระบบ)

*อัปเดตล่าสุด: 24/5/2569 17:19:20*
*ขนาดโปรเจกต์: สแกนทั่งหมด 16 ไฟล์โค้ด*

> [!IMPORTANT]
> เอกสารนี้เป็นโครงสร้างย่อของโค้ดเบส (Code Map) สำหรับให้ AI ใช้เปิดอ่านเมื่อเริ่มต้นเพื่อทำความเข้าใจโครงสร้างและโมเดลฐานข้อมูลของระบบโดยประหยัด Token สูงสุด

---

## 📊 1. โครงสร้างฐานข้อมูล (Database Schemas)

### 🔹 Post (TYPEORM)
**ไฟล์หลัก:** [post.entity.ts](file:///d:/working/repoScaner/mock-project/post.entity.ts)
**ชื่อตาราง:** `posts`

**รายการฟิลด์ (Fields):**
- `id`: `number` (PK)
- `title`: `string` (NotNull)
- `content`: `text`

**ความสัมพันธ์ (Relations):**
- `author`: ManyToOne -> `User`

### 🔹 User (TYPEORM)
**ไฟล์หลัก:** [user.entity.ts](file:///d:/working/repoScaner/mock-project/user.entity.ts)
**ชื่อตาราง:** `users`

**รายการฟิลด์ (Fields):**
- `id`: `number` (PK)
- `email`: `varchar` (NotNull, Unique)
- `phoneNumber`: `string`
- `displayName`: `string`
- `role`: `string`

**ความสัมพันธ์ (Relations):**
- `posts`: OneToMany -> `Post`

### 🔹 Customer (MONGOOSE)
**ไฟล์หลัก:** [user.schema.ts](file:///d:/working/repoScaner/mock-project/user.schema.ts)
**ชื่อคอลเลกชัน:** `customers`

**รายการฟิลด์ (Fields):**
- `name`: `String` (NotNull)

---

## 🌐 2. เส้นทางระบบและ API Endpoints (Routes)

| Method | Route/Action | Source File |
| :--- | :--- | :--- |
| **GET** | `UserController.getUser` | [user.controller.ts](file:///d:/working/repoScaner/mock-project/user.controller.ts) |
| **POST** | `UserController.createUser` | [user.controller.ts](file:///d:/working/repoScaner/mock-project/user.controller.ts) |
| **GET** | `/api/db-schemas` | [app.ts](file:///d:/working/repoScaner/src/server/app.ts) |
| **GET** | `/api/symbols` | [app.ts](file:///d:/working/repoScaner/src/server/app.ts) |
| **GET** | `/api/symbols/file` | [app.ts](file:///d:/working/repoScaner/src/server/app.ts) |
| **GET** | `/api/relations` | [app.ts](file:///d:/working/repoScaner/src/server/app.ts) |
| **GET** | `/api/files` | [app.ts](file:///d:/working/repoScaner/src/server/app.ts) |

---

## 👥 3. แผนผังความสัมพันธ์โครงสร้างคลาส (Inheritance Graph)

```text
UserService [class] --(extends)--> BaseService [class]
UserService [class] --(implements)--> MyInterface [interface]
RepoScannerItem [class] --(extends)--> RepoScannerProvider.getTreeItem [method]
```

---

## 🧩 4. สารบัญคลาสและฟังก์ชันย่อ (Signature-Only Stubs)

### 📄 ไฟล์: `mock-project/Button.tsx`
```typescript
export interface ButtonProps {
  // properties
}

const Button = ...;

```

### 📄 ไฟล์: `mock-project/inheritance.test.ts`
```typescript
export interface MyInterface {
  // properties
}

export class BaseService {
}

export class UserService extends BaseService implements MyInterface {
}

```

### 📄 ไฟล์: `mock-project/post.entity.ts`
```typescript
// Represent a blog post created by a user.
@Entity('posts')
export class Post {
  publish(): void;
}

```

### 📄 ไฟล์: `mock-project/user.controller.ts`
```typescript
// Handles HTTP requests related to user accounts.
@Controller('users')
export class UserController {
  @Get(':id')
  async getUser(@Param('id') id: string);
  @Post()
  async createUser(@Body() createDto: any);
}

```

### 📄 ไฟล์: `mock-project/user.entity.ts`
```typescript
// Represent a user in the system.
@Entity('users')
export class User {
  isAdmin(): boolean;
}

```

### 📄 ไฟล์: `src/database/sqlite.ts`
```typescript
export interface FileRecord {
  // properties
}

export interface SymbolRecord {
  // properties
}

export interface DbSchemaRecord {
  // properties
}

export interface RelationRecord {
  // properties
}

interface JsonDatabaseState {
  // properties
}

export class RepoScannerDb {
  private load(): JsonDatabaseState;
  private flushSync(state: JsonDatabaseState = this.data);
  private scheduleSave();
  getFile(filepath: string): FileRecord | null;
  saveFile(filepath: string, hash: string): number;
  deleteFile(filepath: string): void;
  getAllFiles(): FileRecord[];
  insertSymbol(symbol: SymbolRecord): number;
  getSymbolsByName(name: string): any[];
  getSymbolsByFile(filepath: string): any[];
  insertDbSchema(schema: DbSchemaRecord): void;
  getAllDbSchemas(): any[];
  insertRelation(fromId: number, toId: number, type: string): void;
  getRelations(): any[];
  clear(): void;
  close(): void;
}

```

### 📄 ไฟล์: `src/parser/indexer.ts`
```typescript
export class CodeIndexer {
  private getFileHash(filepath: string): string;
  indexFile(filepath: string, rootDir: string): boolean;
  deleteFile(filepath: string): void;
  private resolveAndInsertRelation(fromSymbolId: number, toSymbolName: string, type: string): void;
  scanDirectory(dirPath: string, rootDir: string, excludeDirs: string[] = ['node_modules', 'dist', '.git', '.repo-scanner']): void;
  resolveAllRelations(): void;
}

```

### 📄 ไฟล์: `src/parser/ts-parser.ts`
```typescript
export interface ParsedSymbol {
  // properties
}

export interface ParsedDbSchema {
  // properties
}

export interface ParsedRelation {
  // properties
}

export interface ParsedFileResult {
  // properties
}

export class CodeParser {
  parseFile(filepath: string, rootDir: string): ParsedFileResult;
  private parseTypeOrmEntity(cls: ClassDeclaration, dbSchemas: ParsedDbSchema[], filepath: string);
  private parseNestMongooseSchema(cls: ClassDeclaration, dbSchemas: ParsedDbSchema[]);
  private parseMongooseSchema(decl: VariableDeclaration, dbSchemas: ParsedDbSchema[]);
  private parseExpressRoutes(sourceFile: SourceFile, symbols: ParsedSymbol[]);
  private getJsDocText(node: any): string | null;
}

```

### 📄 ไฟล์: `src/ui/sidebar.ts`
```typescript
export class RepoScannerProvider implements vscode.TreeDataProvider<RepoScannerItem> {
  setDatabase(db: RepoScannerDb, port: number);
  refresh(): void;
  getTreeItem(element: RepoScannerItem): vscode.TreeItem;
  getChildren(element?: RepoScannerItem): Thenable<RepoScannerItem[]>;
}

export class RepoScannerItem extends vscode.TreeItem {
}

```

### 📄 ไฟล์: `src/watcher/file-watcher.ts`
```typescript
export class FileWatcher {
  start(excludeDirs: string[] = ['node_modules', 'dist', '.git', '.repo-scanner']): void;
  stop(): void;
}

```

