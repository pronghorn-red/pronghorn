// JSON parsing utilities for database import

export interface JsonColumn {
  name: string;
  path: string;
  sampleValues: any[];
  isNested: boolean;
  isArray: boolean;
  childColumns?: JsonColumn[];
}

export interface JsonTable {
  name: string;
  columns: JsonColumn[];
  rows: Record<string, any>[];
  parentTable?: string;
  foreignKey?: string;
}

export interface ParsedJsonData {
  tables: JsonTable[];
  rootType: 'object' | 'array' | 'primitive';
  totalRows: number;
  relationships: ForeignKeyRelationship[];
}

export interface ForeignKeyRelationship {
  parentTable: string;
  childTable: string;
  parentColumn: string;
  childColumn: string;
}

/**
 * Parse a JSON file and extract structured data
 */
export async function parseJsonFile(file: File): Promise<ParsedJsonData> {
  const text = await file.text();
  const data = JSON.parse(text);
  return parseJsonData(data, getTableNameFromFile(file.name));
}

/**
 * Get a table name from a file name
 */
function getTableNameFromFile(fileName: string): string {
  return fileName
    .replace(/\.(json)$/i, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .toLowerCase();
}

/**
 * Parse JSON data and normalize into table structures
 */
export function parseJsonData(data: any, tableName: string = 'imported_data'): ParsedJsonData {
  const rootType = getRootType(data);
  
  if (rootType === 'primitive') {
    return {
      tables: [],
      rootType,
      totalRows: 0,
      relationships: []
    };
  }

  const tables: JsonTable[] = [];
  const relationships: ForeignKeyRelationship[] = [];
  
  if (rootType === 'array') {
    // Array of objects - most common case
    if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
      const result = normalizeArrayOfObjects(data, tableName, tables, relationships);
      tables.push(result.mainTable);
    }
  } else if (rootType === 'object') {
    // Single object or object with nested arrays
    const result = normalizeObject(data, tableName, tables, relationships);
    if (result) {
      tables.push(result);
    }
  }

  return {
    tables,
    rootType,
    totalRows: rootType === 'array' ? data.length : 1,
    relationships
  };
}

/**
 * Determine the root type of JSON data
 */
function getRootType(data: any): 'object' | 'array' | 'primitive' {
  if (Array.isArray(data)) return 'array';
  if (data !== null && typeof data === 'object') return 'object';
  return 'primitive';
}

/**
 * Normalize an array of objects into a table structure
 */
function normalizeArrayOfObjects(
  data: any[],
  tableName: string,
  allTables: JsonTable[],
  relationships: ForeignKeyRelationship[]
): { mainTable: JsonTable } {
  const columns: JsonColumn[] = [];
  const rows: Record<string, any>[] = [];
  const nestedArrays: Map<string, any[][]> = new Map();

  // Collect all unique keys across all objects
  const allKeys = new Set<string>();
  data.forEach(item => {
    if (item && typeof item === 'object') {
      Object.keys(item).forEach(key => allKeys.add(key));
    }
  });

  // Process each row
  data.forEach((item, rowIndex) => {
    if (!item || typeof item !== 'object') return;
    
    const row: Record<string, any> = { _row_id: rowIndex + 1 };
    
    Object.entries(item).forEach(([key, value]) => {
      const sanitizedKey = sanitizeColumnName(key);
      
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
        // Nested array of objects - will become a child table
        if (!nestedArrays.has(sanitizedKey)) {
          nestedArrays.set(sanitizedKey, []);
        }
        nestedArrays.get(sanitizedKey)!.push(
          value.map(v => ({ ...v, _parent_id: rowIndex + 1 }))
        );
      } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        // Nested object - flatten with prefix
        flattenObject(value, sanitizedKey, row);
      } else {
        row[sanitizedKey] = value;
      }
    });
    
    rows.push(row);
  });

  // Build columns from the first few rows
  const sampleSize = Math.min(100, rows.length);
  const columnMap = new Map<string, any[]>();
  
  rows.slice(0, sampleSize).forEach(row => {
    Object.entries(row).forEach(([key, value]) => {
      if (key === '_row_id') return;
      if (!columnMap.has(key)) {
        columnMap.set(key, []);
      }
      columnMap.get(key)!.push(value);
    });
  });

  columnMap.forEach((sampleValues, name) => {
    columns.push({
      name,
      path: name,
      sampleValues,
      isNested: name.includes('_'),
      isArray: false
    });
  });

  // Process nested arrays as child tables
  nestedArrays.forEach((nestedData, childTableName) => {
    const flattenedData = nestedData.flat();
    if (flattenedData.length > 0) {
      const childResult = normalizeArrayOfObjects(
        flattenedData,
        `${tableName}_${childTableName}`,
        allTables,
        relationships
      );
      allTables.push(childResult.mainTable);
      
      relationships.push({
        parentTable: tableName,
        childTable: `${tableName}_${childTableName}`,
        parentColumn: '_row_id',
        childColumn: '_parent_id'
      });
    }
  });

  return {
    mainTable: {
      name: tableName,
      columns,
      rows
    }
  };
}

/**
 * Normalize a single object into a table structure
 */
function normalizeObject(
  data: Record<string, any>,
  tableName: string,
  allTables: JsonTable[],
  relationships: ForeignKeyRelationship[]
): JsonTable | null {
  // Check if this object has arrays that should become separate tables
  const arrayKeys: string[] = [];
  const scalarKeys: string[] = [];
  
  Object.entries(data).forEach(([key, value]) => {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      arrayKeys.push(key);
    } else {
      scalarKeys.push(key);
    }
  });

  // If there are array properties, process them as child tables
  if (arrayKeys.length > 0) {
    arrayKeys.forEach(key => {
      const childResult = normalizeArrayOfObjects(
        data[key],
        sanitizeColumnName(key),
        allTables,
        relationships
      );
      allTables.push(childResult.mainTable);
    });
  }

  // Create main table with scalar values
  if (scalarKeys.length > 0) {
    const row: Record<string, any> = { _row_id: 1 };
    const columns: JsonColumn[] = [];
    
    scalarKeys.forEach(key => {
      const sanitizedKey = sanitizeColumnName(key);
      const value = data[key];
      
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        flattenObject(value, sanitizedKey, row);
      } else {
        row[sanitizedKey] = value;
      }
    });

    Object.entries(row).forEach(([name, value]) => {
      if (name === '_row_id') return;
      columns.push({
        name,
        path: name,
        sampleValues: [value],
        isNested: name.includes('_'),
        isArray: false
      });
    });

    return {
      name: tableName,
      columns,
      rows: [row]
    };
  }

  return null;
}

/**
 * Flatten a nested object with key prefix
 */
function flattenObject(obj: Record<string, any>, prefix: string, target: Record<string, any>): void {
  Object.entries(obj).forEach(([key, value]) => {
    const newKey = `${prefix}_${sanitizeColumnName(key)}`;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      flattenObject(value, newKey, target);
    } else {
      target[newKey] = value;
    }
  });
}

/**
 * Sanitize a column name for PostgreSQL
 */
function sanitizeColumnName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1')
    .toLowerCase()
    .substring(0, 63);
}

/**
 * Get headers from parsed JSON data
 */
export function getJsonHeaders(table: JsonTable): string[] {
  return table.columns.map(col => col.name).filter(n => !n.startsWith('_'));
}

/**
 * Get rows as 2D array for grid display
 */
export function getJsonRowsAsArray(table: JsonTable): any[][] {
  const headers = getJsonHeaders(table);
  return table.rows.map(row => headers.map(h => row[h] ?? null));
}
