import * as fs from 'fs';
import * as path from 'path';
import { RepoScannerDb } from '../database/sqlite';

export function generateBlueprint(db: RepoScannerDb, rootDir: string): string {
  const allFiles = db.getAllFiles();
  const allDbSchemas = db.getAllDbSchemas();
  const allRelations = db.getRelations();
  
  let md = `# 🗺️ AI Codebase Blueprint (ลายแทงโครงสร้างระบบ)\n\n`;
  md += `*อัปเดตล่าสุด: ${new Date().toLocaleString('th-TH')}*\n`;
  md += `*ขนาดโปรเจกต์: สแกนทั่งหมด ${allFiles.length} ไฟล์โค้ด*\n\n`;
  md += `> [!IMPORTANT]\n`;
  md += `> เอกสารนี้เป็นโครงสร้างย่อของโค้ดเบส (Code Map) สำหรับให้ AI ใช้เปิดอ่านเมื่อเริ่มต้นเพื่อทำความเข้าใจโครงสร้างและโมเดลฐานข้อมูลของระบบโดยประหยัด Token สูงสุด\n\n`;
  md += `---\n\n`;

  // 1. Database Schemas Section
  md += `## 📊 1. โครงสร้างฐานข้อมูล (Database Schemas)\n\n`;
  if (allDbSchemas.length === 0) {
    md += `*ไม่พบการประกาศโมเดลตารางฐานข้อมูล TypeORM หรือ Mongoose ในระบบ*\n\n`;
  } else {
    for (const schema of allDbSchemas) {
      try {
        const data = JSON.parse(schema.schema_json);
        const dbType = schema.db_type.toUpperCase();
        md += `### 🔹 ${schema.entity_name} (${dbType})\n`;
        md += `**ไฟล์หลัก:** [${path.basename(schema.filepath)}](file:///${schema.filepath})\n`;
        if (data.tableName) md += `**ชื่อตาราง:** \`${data.tableName}\`\n`;
        if (data.collectionName) md += `**ชื่อคอลเลกชัน:** \`${data.collectionName}\`\n`;
        
        md += `\n**รายการฟิลด์ (Fields):**\n`;
        if (data.columns && Array.isArray(data.columns)) {
          for (const col of data.columns) {
            const attrs: string[] = [];
            if (col.isPrimary) attrs.push('PK');
            if (col.isRequired || col.isNullable === false) attrs.push('NotNull');
            if (col.isUnique) attrs.push('Unique');
            const attrStr = attrs.length > 0 ? ` (${attrs.join(', ')})` : '';
            md += `- \`${col.name}\`: \`${col.type}\`${attrStr}\n`;
          }
        }
        
        if (data.relations && Array.isArray(data.relations) && data.relations.length > 0) {
          md += `\n**ความสัมพันธ์ (Relations):**\n`;
          for (const rel of data.relations) {
            md += `- \`${rel.fieldName}\`: ${rel.relationType} -> \`${rel.targetEntity}\`\n`;
          }
        }
        md += `\n`;
      } catch (e) {
        md += `- *ข้อผิดพลาดในการแกะโมเดล ${schema.entity_name}*\n\n`;
      }
    }
  }

  md += `---\n\n`;

  // 2. API Endpoints Section
  md += `## 🌐 2. เส้นทางระบบและ API Endpoints (Routes)\n\n`;
  const allSymbols = [];
  for (const f of allFiles) {
    const syms = db.getSymbolsByFile(f.filepath);
    for (const s of syms) {
      allSymbols.push({ ...s, filepath: f.filepath });
    }
  }

  const routes = allSymbols.filter(s => s.kind.startsWith('express-route-') || s.kind.startsWith('http-route-'));
  if (routes.length === 0) {
    md += `*ไม่พบการกำหนด HTTP Routes ในระบบ*\n\n`;
  } else {
    md += `| Method | Route/Action | Source File |\n`;
    md += `| :--- | :--- | :--- |\n`;
    for (const r of routes) {
      const parts = r.name.split(' ');
      const method = parts.length > 1 ? parts[0] : r.kind.replace('express-route-', '').replace('http-route-', '').toUpperCase();
      const action = parts.length > 1 ? parts.slice(1).join(' ') : r.name;
      md += `| **${method}** | \`${action}\` | [${path.basename(r.filepath)}](file:///${r.filepath}) |\n`;
    }
    md += `\n`;
  }

  md += `---\n\n`;

  // 3. Class Inheritance & Interfaces Relations Section
  md += `## 👥 3. แผนผังความสัมพันธ์โครงสร้างคลาส (Inheritance Graph)\n\n`;
  if (allRelations.length === 0) {
    md += `*ไม่มีความสัมพันธ์เชื่อมต่อของคลาสแบบ extends หรือ implements ในระบบ*\n\n`;
  } else {
    md += '```text\n';
    for (const r of allRelations) {
      md += `${r.from_name} [${r.from_kind}] --(${r.type})--> ${r.to_name} [${r.to_kind}]\n`;
    }
    md += '```\n\n';
  }

  md += `---\n\n`;

  // 4. Compact Code Symbols Stubs
  md += `## 🧩 4. สารบัญคลาสและฟังก์ชันย่อ (Signature-Only Stubs)\n\n`;
  const classesAndComponents = allSymbols.filter(s => 
    ['class', 'entity', 'nestjs-service', 'nestjs-controller', 'react-component', 'interface'].includes(s.kind)
  );

  if (classesAndComponents.length === 0) {
    md += `*ไม่พบคลาสหรือส่วนประกอบหลักในการสร้างสารบัญแบบย่อ*\n\n`;
  } else {
    // Group symbols by file
    const filesMap = new Map<string, any[]>();
    for (const s of allSymbols) {
      const list = filesMap.get(s.filepath) || [];
      list.push(s);
      filesMap.set(s.filepath, list);
    }

    for (const [filepath, fileSymbols] of filesMap.entries()) {
      const relFile = path.relative(rootDir, filepath).replace(/\\/g, '/');
      
      // Filter out files that don't contain classes, services, controllers, interfaces, or react components
      const hasCoreSymbol = fileSymbols.some(s => 
        ['class', 'entity', 'nestjs-service', 'nestjs-controller', 'react-component', 'interface'].includes(s.kind)
      );
      if (!hasCoreSymbol) continue;

      md += `### 📄 ไฟล์: \`${relFile}\`\n`;
      md += '```typescript\n';
      
      const fileClasses = fileSymbols.filter(s => ['class', 'entity', 'nestjs-service', 'nestjs-controller', 'angular-component'].includes(s.kind));
      const fileInterfaces = fileSymbols.filter(s => s.kind === 'interface');
      const fileFunctions = fileSymbols.filter(s => s.kind === 'function' || s.kind === 'react-component');

      // Format Interfaces
      for (const itf of fileInterfaces) {
        if (itf.docstring) md += `// ${itf.docstring.split('\n')[0]}\n`;
        md += `${itf.signature} {\n  // properties\n}\n\n`;
      }

      // Format Classes & Methods
      for (const cls of fileClasses) {
        if (cls.docstring) md += `// ${cls.docstring.split('\n')[0]}\n`;
        md += `${cls.signature} {\n`;
        
        const methods = fileSymbols.filter(s => s.name.startsWith(`${cls.name}.`));
        for (const m of methods) {
          const mName = m.name.substring(cls.name.length + 1);
          md += `  ${m.signature};\n`;
        }
        md += `}\n\n`;
      }

      // Format Standalone Functions
      for (const fn of fileFunctions) {
        if (fn.docstring) md += `// ${fn.docstring.split('\n')[0]}\n`;
        md += `${fn.signature};\n\n`;
      }

      md += '```\n\n';
    }
  }

  return md;
}
