import * as vscode from 'vscode';
import * as path from 'path';
import { RepoScannerDb } from '../database/sqlite';

export class RepoScannerProvider implements vscode.TreeDataProvider<RepoScannerItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<RepoScannerItem | undefined | null | void> = new vscode.EventEmitter<RepoScannerItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<RepoScannerItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private db: RepoScannerDb | null = null;
  private port: number = 9876;

  constructor() {}

  setDatabase(db: RepoScannerDb, port: number) {
    this.db = db;
    this.port = port;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: RepoScannerItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: RepoScannerItem): Thenable<RepoScannerItem[]> {
    if (!this.db) {
      return Promise.resolve([
        new RepoScannerItem(
          'ระบบยังไม่ทำงาน',
          vscode.TreeItemCollapsibleState.None,
          'status-offline',
          new vscode.ThemeIcon('error')
        )
      ]);
    }

    if (!element) {
      // Root items
      const fileCount = this.db.getAllFiles().length;
      
      const items = [
        new RepoScannerItem(
          `สถานะ: กำลังเฝ้าดูระบบ (พอร์ต: ${this.port})`,
          vscode.TreeItemCollapsibleState.None,
          'status-active',
          new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('testing.iconPassed'))
        ),
        new RepoScannerItem(
          '📊 โครงสร้างฐานข้อมูล (Database Schemas)',
          vscode.TreeItemCollapsibleState.Collapsed,
          'db-schemas-root',
          new vscode.ThemeIcon('database')
        ),
        new RepoScannerItem(
          `📁 จำนวนไฟล์ที่สแกนแล้ว: ${fileCount} ไฟล์`,
          vscode.TreeItemCollapsibleState.None,
          'files-count',
          new vscode.ThemeIcon('files')
        ),
        new RepoScannerItem(
          '⚙️ เมนูคำสั่งด่วน (Quick Actions)',
          vscode.TreeItemCollapsibleState.Expanded,
          'actions-root',
          new vscode.ThemeIcon('tools')
        )
      ];
      return Promise.resolve(items);
    }

    // Children for DB Schemas
    if (element.contextValue === 'db-schemas-root') {
      try {
        const schemas = this.db.getAllDbSchemas();
        if (schemas.length === 0) {
          return Promise.resolve([
            new RepoScannerItem('ไม่พบโมเดลฐานข้อมูล', vscode.TreeItemCollapsibleState.None)
          ]);
        }
        
        return Promise.resolve(
          schemas.map(s => {
            const label = `${s.entity_name} (${s.db_type.toUpperCase()})`;
            return new RepoScannerItem(
              label,
              vscode.TreeItemCollapsibleState.Collapsed,
              'db-entity-node',
              new vscode.ThemeIcon('table'),
              undefined,
              s
            );
          })
        );
      } catch (e) {
        return Promise.resolve([new RepoScannerItem('เกิดข้อผิดพลาดในการโหลด', vscode.TreeItemCollapsibleState.None)]);
      }
    }

    // Children for DB Entity details
    if (element.contextValue === 'db-entity-node' && element.schemaData) {
      try {
        const data = JSON.parse(element.schemaData.schema_json);
        const children: RepoScannerItem[] = [];
        
        if (data.tableName) {
          children.push(new RepoScannerItem(`ตาราง: ${data.tableName}`, vscode.TreeItemCollapsibleState.None, 'info', new vscode.ThemeIcon('chevron-right')));
        }
        if (data.collectionName) {
          children.push(new RepoScannerItem(`คอลเลกชัน: ${data.collectionName}`, vscode.TreeItemCollapsibleState.None, 'info', new vscode.ThemeIcon('chevron-right')));
        }

        // Add Columns
        if (data.columns && Array.isArray(data.columns)) {
          for (const col of data.columns) {
            const attrs: string[] = [];
            if (col.isPrimary) attrs.push('PK');
            if (col.isRequired || col.isNullable === false) attrs.push('NotNull');
            if (col.isUnique) attrs.push('Unique');
            
            const label = `${col.name}: ${col.type}${attrs.length > 0 ? ` (${attrs.join(', ')})` : ''}`;
            children.push(new RepoScannerItem(label, vscode.TreeItemCollapsibleState.None, 'field', new vscode.ThemeIcon('symbol-field')));
          }
        }

        // Add Relations
        if (data.relations && Array.isArray(data.relations)) {
          for (const rel of data.relations) {
            const label = `Relation: ${rel.fieldName} (${rel.relationType} -> ${rel.targetEntity})`;
            children.push(new RepoScannerItem(label, vscode.TreeItemCollapsibleState.None, 'relation', new vscode.ThemeIcon('symbol-interface')));
          }
        }

        return Promise.resolve(children);
      } catch (e) {
        return Promise.resolve([]);
      }
    }

    // Children for Quick Actions
    if (element.contextValue === 'actions-root') {
      return Promise.resolve([
        new RepoScannerItem(
          '🗺️ เจนเนอเรตลายแทงระบบ (Generate Blueprint)',
          vscode.TreeItemCollapsibleState.None,
          'action-btn',
          new vscode.ThemeIcon('map'),
          {
            command: 'repo-scanner.generateBlueprint',
            title: 'Generate Blueprint'
          }
        ),
        new RepoScannerItem(
          '🗑️ เคลียร์แคชระบบ (Clear Cache)',
          vscode.TreeItemCollapsibleState.None,
          'action-btn',
          new vscode.ThemeIcon('trash'),
          {
            command: 'repo-scanner.clearDatabase',
            title: 'Clear Scanner Database Cache'
          }
        )
      ]);
    }

    return Promise.resolve([]);
  }
}

export class RepoScannerItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue?: string,
    public readonly iconPath?: vscode.ThemeIcon | string,
    public readonly command?: vscode.Command,
    public readonly schemaData?: any
  ) {
    super(label, collapsibleState);
    this.tooltip = this.label;
    
    if (iconPath) {
      this.iconPath = iconPath;
    }
  }
}
