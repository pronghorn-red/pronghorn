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
 * Parse a JSON string directly (for pasted data)
 */
export function parseJsonString(text: string, tableName: string = 'pasted_data'): ParsedJsonData {
  const data = JSON.parse(text);
  return parseJsonData(data, tableName);
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

// Global row ID counter per table
let globalRowCounters: Map<string, number> = new Map();

function getNextRowId(tableName: string): number {
  const current = globalRowCounters.get(tableName) || 0;
  const next = current + 1;
  globalRowCounters.set(tableName, next);
  return next;
}

function resetRowCounters(): void {
  globalRowCounters = new Map();
}

/**
 * Parse JSON data and normalize into table structures
 */
export function parseJsonData(data: any, tableName: string = 'imported_data'): ParsedJsonData {
  resetRowCounters();
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
      processArrayOfObjects(data, tableName, tables, relationships, null, null);
    } else if (data.length > 0) {
      // Array of primitives
      processPrimitiveArray(data, tableName, tables, relationships, null, null);
    }
  } else if (rootType === 'object') {
    // Single object - check if it's a wrapper object
    processRootObject(data, tableName, tables, relationships);
  }

  return {
    tables,
    rootType,
    totalRows: tables.length > 0 ? tables[0].rows.length : 0,
    relationships
  };
}

/**
 * Process a root object that may contain nested structures
 */
function processRootObject(
  data: Record<string, any>,
  tableName: string,
  tables: JsonTable[],
  relationships: ForeignKeyRelationship[]
): void {
  const keys = Object.keys(data);
  
  // Check if this is a wrapper object with a single key containing an object/array
  if (keys.length === 1) {
    const key = keys[0];
    const value = data[key];
    const childTableName = sanitizeColumnName(key);
    
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      // Single key with array of objects - use the key as the table name
      processArrayOfObjects(value, childTableName, tables, relationships, null, null);
      return;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Single key with nested object - descend into it
      processRootObject(value, childTableName, tables, relationships);
      return;
    }
  }
  
  // Process as a regular object
  processObject(data, tableName, tables, relationships, null, null);
}

/**
 * Process a single object, extracting scalar values and processing nested arrays/objects
 */
function processObject(
  data: Record<string, any>,
  tableName: string,
  tables: JsonTable[],
  relationships: ForeignKeyRelationship[],
  parentTable: string | null,
  parentRowId: number | null
): number {
  const row: Record<string, any> = {};
  const rowId = getNextRowId(tableName);
  row['_row_id'] = rowId;
  
  if (parentTable && parentRowId !== null) {
    row['_parent_id'] = parentRowId;
  }
  
  const nestedArrays: { key: string; value: any[] }[] = [];
  const nestedObjects: { key: string; value: Record<string, any> }[] = [];
  
  // First pass: separate scalar values from nested structures
  for (const [key, value] of Object.entries(data)) {
    const sanitizedKey = sanitizeColumnName(key);
    
    if (Array.isArray(value)) {
      if (value.length > 0) {
        nestedArrays.push({ key: sanitizedKey, value });
      }
    } else if (value !== null && typeof value === 'object') {
      // Check if nested object has arrays (making it a separate entity)
      if (hasNestedArrays(value)) {
        nestedObjects.push({ key: sanitizedKey, value });
      } else {
        // Flatten simple nested objects
        flattenObject(value, sanitizedKey, row);
      }
    } else {
      row[sanitizedKey] = value;
    }
  }
  
  // Add or update the table
  let table = tables.find(t => t.name === tableName);
  if (!table) {
    table = {
      name: tableName,
      columns: [],
      rows: [],
      parentTable: parentTable || undefined,
      foreignKey: parentTable ? '_parent_id' : undefined
    };
    tables.push(table);
    
    if (parentTable) {
      relationships.push({
        parentTable,
        childTable: tableName,
        parentColumn: '_row_id',
        childColumn: '_parent_id'
      });
    }
  }
  
  // Update columns based on this row
  for (const [key, value] of Object.entries(row)) {
    if (key === '_row_id' || key === '_parent_id') continue;
    
    let column = table.columns.find(c => c.name === key);
    if (!column) {
      column = {
        name: key,
        path: key,
        sampleValues: [],
        isNested: key.includes('_'),
        isArray: false
      };
      table.columns.push(column);
    }
    if (column.sampleValues.length < 5) {
      column.sampleValues.push(value);
    }
  }
  
  table.rows.push(row);
  
  // Process nested objects that have their own structure
  for (const { key, value } of nestedObjects) {
    processObject(value, key, tables, relationships, tableName, rowId);
  }
  
  // Process nested arrays
  for (const { key, value } of nestedArrays) {
    const childTableName = key;
    
    if (typeof value[0] === 'object' && value[0] !== null) {
      // Array of objects
      processArrayOfObjects(value, childTableName, tables, relationships, tableName, rowId);
    } else {
      // Array of primitives (like skills: ["Python", "React"])
      processPrimitiveArray(value, childTableName, tables, relationships, tableName, rowId);
    }
  }
  
  return rowId;
}

/**
 * Process an array of objects
 */
function processArrayOfObjects(
  data: any[],
  tableName: string,
  tables: JsonTable[],
  relationships: ForeignKeyRelationship[],
  parentTable: string | null,
  parentRowId: number | null
): void {
  for (const item of data) {
    if (item !== null && typeof item === 'object') {
      processObject(item, tableName, tables, relationships, parentTable, parentRowId);
    }
  }
}

/**
 * Process an array of primitive values into a junction table
 */
function processPrimitiveArray(
  data: any[],
  tableName: string,
  tables: JsonTable[],
  relationships: ForeignKeyRelationship[],
  parentTable: string | null,
  parentRowId: number | null
): void {
  let table = tables.find(t => t.name === tableName);
  
  if (!table) {
    table = {
      name: tableName,
      columns: [
        { name: 'value', path: 'value', sampleValues: [], isNested: false, isArray: false }
      ],
      rows: [],
      parentTable: parentTable || undefined,
      foreignKey: parentTable ? '_parent_id' : undefined
    };
    tables.push(table);
    
    if (parentTable) {
      // Add _parent_id column
      table.columns.push({
        name: '_parent_id',
        path: '_parent_id',
        sampleValues: [],
        isNested: false,
        isArray: false
      });
      
      relationships.push({
        parentTable,
        childTable: tableName,
        parentColumn: '_row_id',
        childColumn: '_parent_id'
      });
    }
  }
  
  // Add rows for each primitive value
  for (const value of data) {
    const row: Record<string, any> = {
      _row_id: getNextRowId(tableName),
      value
    };
    if (parentRowId !== null) {
      row['_parent_id'] = parentRowId;
    }
    table.rows.push(row);
    
    // Update sample values
    const valueCol = table.columns.find(c => c.name === 'value');
    if (valueCol && valueCol.sampleValues.length < 5) {
      valueCol.sampleValues.push(value);
    }
  }
}

/**
 * Check if an object contains any nested arrays (at any depth)
 */
function hasNestedArrays(obj: Record<string, any>): boolean {
  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      return true;
    }
    if (value !== null && typeof value === 'object') {
      if (hasNestedArrays(value)) {
        return true;
      }
    }
  }
  return false;
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
 * Flatten a nested object with key prefix
 */
function flattenObject(obj: Record<string, any>, prefix: string, target: Record<string, any>): void {
  for (const [key, value] of Object.entries(obj)) {
    const newKey = `${prefix}_${sanitizeColumnName(key)}`;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      flattenObject(value, newKey, target);
    } else if (!Array.isArray(value)) {
      target[newKey] = value;
    }
    // Skip arrays - they're handled separately
  }
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
