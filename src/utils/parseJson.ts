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

// Normalization strategy types
export type NormalizationStrategy = 'partial' | 'full' | 'custom';

export interface NormalizationOptions {
  strategy: NormalizationStrategy;
  // For 'custom' strategy - paths to normalize into separate tables
  customTablePaths?: Set<string>;
}

// JSON structure analysis types
export interface JsonStructureNode {
  path: string;
  key: string;
  type: 'object' | 'array';
  hasNestedArrays: boolean;
  fieldCount: number;
  sampleKeys?: string[];  // For objects - first 5 keys
  itemType?: 'object' | 'primitive';  // For arrays - type of items
  itemCount?: number;  // For arrays - number of items
  children?: JsonStructureNode[];
  depth: number;
}

/**
 * Analyze JSON structure to build a tree of potential tables
 * Used for the normalization selector UI
 */
export function analyzeJsonStructure(data: any, path: string = '', depth: number = 0): JsonStructureNode[] {
  const nodes: JsonStructureNode[] = [];
  
  // If root is an array, analyze the first item
  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
      return analyzeJsonStructure(data[0], path, depth);
    }
    return [];
  }
  
  if (typeof data !== 'object' || data === null) {
    return [];
  }
  
  for (const [key, value] of Object.entries(data)) {
    // Skip MongoDB-style fields
    if (key === '_id' || key === '__v') continue;
    
    const nodePath = path ? `${path}.${key}` : key;
    
    if (Array.isArray(value)) {
      const itemType = value.length > 0 && typeof value[0] === 'object' && value[0] !== null 
        ? 'object' 
        : 'primitive';
      
      const node: JsonStructureNode = {
        path: nodePath,
        key,
        type: 'array',
        hasNestedArrays: true,
        fieldCount: itemType === 'object' && value[0] ? Object.keys(value[0]).length : 1,
        itemType,
        itemCount: value.length,
        depth,
        children: itemType === 'object' && value.length > 0
          ? analyzeJsonStructure(value[0], nodePath, depth + 1)
          : undefined
      };
      nodes.push(node);
    } else if (typeof value === 'object' && value !== null) {
      const keys = Object.keys(value).filter(k => k !== '_id' && k !== '__v' && !k.startsWith('$'));
      const node: JsonStructureNode = {
        path: nodePath,
        key,
        type: 'object',
        hasNestedArrays: hasNestedArrays(value),
        fieldCount: keys.length,
        sampleKeys: keys.slice(0, 5),
        depth,
        children: analyzeJsonStructure(value, nodePath, depth + 1)
      };
      // Only add objects that have fields
      if (keys.length > 0) {
        nodes.push(node);
      }
    }
  }
  
  return nodes;
}

/**
 * Parse a JSON file and extract structured data
 */
export async function parseJsonFile(
  file: File, 
  options: NormalizationOptions = { strategy: 'partial' }
): Promise<ParsedJsonData> {
  const text = await file.text();
  const data = JSON.parse(text);
  return parseJsonData(data, getTableNameFromFile(file.name), options);
}

/**
 * Parse a JSON string directly (for pasted data)
 */
export function parseJsonString(
  text: string, 
  tableName: string = 'pasted_data',
  options: NormalizationOptions = { strategy: 'partial' }
): ParsedJsonData {
  const data = JSON.parse(text);
  return parseJsonData(data, tableName, options);
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
 * Generate a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Parse JSON data and normalize into table structures
 */
export function parseJsonData(
  data: any, 
  tableName: string = 'imported_data',
  options: NormalizationOptions = { strategy: 'partial' }
): ParsedJsonData {
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
      processArrayOfObjects(data, tableName, tables, relationships, null, null, options, '');
    } else if (data.length > 0) {
      // Array of primitives
      processPrimitiveArray(data, tableName, tables, relationships, null, null);
    }
  } else if (rootType === 'object') {
    // Single object - check if it's a wrapper object
    processRootObject(data, tableName, tables, relationships, options);
  }

  // Calculate totalRows as sum of all table rows
  const totalRows = tables.reduce((sum, table) => sum + table.rows.length, 0);

  return {
    tables,
    rootType,
    totalRows,
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
  relationships: ForeignKeyRelationship[],
  options: NormalizationOptions
): void {
  const keys = Object.keys(data);
  
  // Check if this is a wrapper object with a single key containing an object/array
  if (keys.length === 1) {
    const key = keys[0];
    const value = data[key];
    const childTableName = sanitizeColumnName(key);
    
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      // Single key with array of objects - use the key as the table name
      processArrayOfObjects(value, childTableName, tables, relationships, null, null, options, '');
      return;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Single key with nested object - descend into it
      processRootObject(value, childTableName, tables, relationships, options);
      return;
    }
  }
  
  // Process as a regular object
  processObject(data, tableName, tables, relationships, null, null, options, '');
}

/**
 * Determine if a nested object should become a separate table based on normalization strategy
 */
function shouldNormalizeObject(
  value: Record<string, any>,
  currentPath: string,
  options: NormalizationOptions
): boolean {
  switch (options.strategy) {
    case 'full':
      // All objects become separate tables
      return true;
    case 'partial':
      // Only objects with nested arrays become separate tables (original behavior)
      return hasNestedArrays(value);
    case 'custom':
      // Check if this path is in the custom paths set
      return options.customTablePaths?.has(currentPath) ?? false;
    default:
      return hasNestedArrays(value);
  }
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
  parentRowId: string | null,
  options: NormalizationOptions,
  currentPath: string
): string {
  const row: Record<string, any> = {};
  const rowId = generateUUID();
  row['_row_id'] = rowId;
  
  if (parentTable && parentRowId !== null) {
    row['_parent_id'] = parentRowId;
  }
  
  const nestedArrays: { key: string; value: any[]; path: string }[] = [];
  const nestedObjects: { key: string; value: Record<string, any>; path: string }[] = [];
  
  // First pass: separate scalar values from nested structures
  for (const [key, value] of Object.entries(data)) {
    const sanitizedKey = sanitizeColumnName(key);
    const fullPath = currentPath ? `${currentPath}.${key}` : key;
    
    if (Array.isArray(value)) {
      if (value.length > 0) {
        nestedArrays.push({ key: sanitizedKey, value, path: fullPath });
      }
    } else if (value !== null && typeof value === 'object') {
      // Check if nested object should be normalized based on strategy
      if (shouldNormalizeObject(value, fullPath, options)) {
        nestedObjects.push({ key: sanitizedKey, value, path: fullPath });
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
    // Don't skip _parent_id - we need it for FK relationships
    if (key === '_row_id') continue;
    
    let column = table.columns.find(c => c.name === key);
    if (!column) {
      column = {
        name: key,
        path: key,
        sampleValues: [],
        isNested: key.includes('_') && key !== '_parent_id',
        isArray: false
      };
      table.columns.push(column);
    }
    if (column.sampleValues.length < 5 && value !== undefined) {
      column.sampleValues.push(value);
    }
  }
  
  table.rows.push(row);
  
  // Process nested objects that have their own structure
  for (const { key, value, path } of nestedObjects) {
    processObject(value, key, tables, relationships, tableName, rowId, options, path);
  }
  
  // Process nested arrays
  for (const { key, value, path } of nestedArrays) {
    const childTableName = key;
    
    if (typeof value[0] === 'object' && value[0] !== null) {
      // Array of objects
      processArrayOfObjects(value, childTableName, tables, relationships, tableName, rowId, options, path);
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
  parentRowId: string | null,
  options: NormalizationOptions,
  currentPath: string
): void {
  for (const item of data) {
    if (item !== null && typeof item === 'object') {
      processObject(item, tableName, tables, relationships, parentTable, parentRowId, options, currentPath);
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
  parentRowId: string | null
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
      _row_id: generateUUID(),
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
 * Get headers from parsed JSON data (excluding internal columns for display)
 */
export function getJsonHeaders(table: JsonTable): string[] {
  return table.columns.map(col => col.name).filter(n => n !== '_row_id');
}

/**
 * Get all headers including internal columns (for SQL generation)
 */
export function getAllJsonHeaders(table: JsonTable): string[] {
  return table.columns.map(col => col.name);
}

/**
 * Get rows as 2D array for grid display (excluding _row_id)
 */
export function getJsonRowsAsArray(table: JsonTable): any[][] {
  const headers = getJsonHeaders(table);
  return table.rows.map(row => headers.map(h => row[h] ?? null));
}

/**
 * Get rows with all data including internal columns (for SQL generation)
 */
export function getAllJsonRowsAsArray(table: JsonTable): any[][] {
  const headers = getAllJsonHeaders(table);
  return table.rows.map(row => headers.map(h => row[h] ?? null));
}
