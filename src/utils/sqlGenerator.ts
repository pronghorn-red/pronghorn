// SQL generation utilities for database import

import { PostgresType, ColumnTypeInfo } from './typeInference';
import { JsonTable, ForeignKeyRelationship, getAllJsonHeaders } from './parseJson';

export interface ColumnDefinition {
  name: string;
  type: PostgresType;
  nullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  defaultValue?: string;
  references?: {
    table: string;
    column: string;
  };
}

export interface IndexDefinition {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface TableDefinition {
  name: string;
  schema: string;
  columns: ColumnDefinition[];
  indexes: IndexDefinition[];
}

export interface SQLStatement {
  type: 'CREATE_TABLE' | 'ALTER_TABLE' | 'CREATE_INDEX' | 'INSERT' | 'DROP_TABLE' | 'BEGIN_TRANSACTION' | 'COMMIT_TRANSACTION';
  sql: string;
  description: string;
  sequence: number;
  tableName?: string;
}

export interface SmartImportOptions {
  wrapInTransaction?: boolean;  // Default true
}

/**
 * Sanitize a table name for PostgreSQL
 */
export function sanitizeTableName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1')
    .toLowerCase()
    .substring(0, 63);
}

/**
 * Sanitize a column name for PostgreSQL
 */
export function sanitizeColumnName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1')
    .toLowerCase()
    .substring(0, 63);
}

/**
 * Check if a string is a MongoDB ObjectId (24-char hex string)
 */
function isMongoObjectId(value: any): boolean {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{24}$/i.test(value);
}

/**
 * Check if a string is a valid UUID
 */
function isValidUUID(value: any): boolean {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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
 * Generate CREATE TABLE SQL statement
 */
export function generateCreateTableSQL(
  tableDef: TableDefinition
): SQLStatement {
  const { name, schema, columns } = tableDef;
  const sanitizedName = sanitizeTableName(name);
  const fullTableName = schema ? `"${schema}"."${sanitizedName}"` : `"${sanitizedName}"`;

  const columnDefs = columns.map(col => {
    const parts = [`  "${sanitizeColumnName(col.name)}"`, col.type];

    if (col.isPrimaryKey) {
      parts.push('PRIMARY KEY');
    } else {
      if (!col.nullable) {
        parts.push('NOT NULL');
      }
      if (col.isUnique) {
        parts.push('UNIQUE');
      }
    }

    if (col.defaultValue !== undefined) {
      parts.push(`DEFAULT ${col.defaultValue}`);
    }

    if (col.references) {
      parts.push(`REFERENCES "${col.references.table}"("${col.references.column}")`);
    }

    return parts.join(' ');
  });

  const sql = `CREATE TABLE IF NOT EXISTS ${fullTableName} (\n${columnDefs.join(',\n')}\n);`;

  return {
    type: 'CREATE_TABLE',
    sql,
    description: `Create table ${sanitizedName}`,
    sequence: 0,
    tableName: sanitizedName
  };
}

/**
 * Generate CREATE INDEX SQL statements
 */
export function generateIndexSQL(
  tableName: string,
  schema: string,
  indexes: IndexDefinition[]
): SQLStatement[] {
  const sanitizedTable = sanitizeTableName(tableName);
  const fullTableName = schema ? `"${schema}"."${sanitizedTable}"` : `"${sanitizedTable}"`;

  return indexes.map((index, i) => {
    const indexName = `idx_${sanitizedTable}_${index.columns.map(sanitizeColumnName).join('_')}`;
    const uniqueKeyword = index.unique ? 'UNIQUE ' : '';
    const columnList = index.columns.map(c => `"${sanitizeColumnName(c)}"`).join(', ');
    
    const sql = `CREATE ${uniqueKeyword}INDEX IF NOT EXISTS "${indexName}" ON ${fullTableName} (${columnList});`;

    return {
      type: 'CREATE_INDEX' as const,
      sql,
      description: `Create ${index.unique ? 'unique ' : ''}index on ${index.columns.join(', ')}`,
      sequence: i + 1,
      tableName: sanitizedTable
    };
  });
}

/**
 * Generate batch INSERT SQL statements
 */
export function generateInsertBatchSQL(
  tableName: string,
  schema: string,
  columns: string[],
  rows: any[][],
  batchSize: number = 50
): SQLStatement[] {
  const sanitizedTable = sanitizeTableName(tableName);
  const fullTableName = schema ? `"${schema}"."${sanitizedTable}"` : `"${sanitizedTable}"`;
  const columnList = columns.map(c => `"${sanitizeColumnName(c)}"`).join(', ');
  
  const statements: SQLStatement[] = [];
  const totalBatches = Math.ceil(rows.length / batchSize);

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    
    const valueRows = batch.map(row => {
      const values = row.map(val => formatSQLValue(val));
      return `(${values.join(', ')})`;
    });

    const sql = `INSERT INTO ${fullTableName} (${columnList})\nVALUES\n${valueRows.join(',\n')};`;

    statements.push({
      type: 'INSERT',
      sql,
      description: `Insert rows ${i + 1}-${Math.min(i + batchSize, rows.length)} of ${rows.length} total (batch ${batchNum}/${totalBatches})`,
      sequence: batchNum,
      tableName: sanitizedTable
    });
  }

  return statements;
}

/**
 * Format a value for SQL insertion
 */
function formatSQLValue(value: any): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value)) {
      return 'NULL';
    }
    return String(value);
  }

  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }

  if (typeof value === 'object') {
    return `'${escapeSQLString(JSON.stringify(value))}'::jsonb`;
  }

  // String value - escape single quotes
  return `'${escapeSQLString(String(value))}'`;
}

/**
 * Escape single quotes in SQL strings
 */
function escapeSQLString(str: string): string {
  return str.replace(/'/g, "''");
}

/**
 * Generate complete migration script for a new table with data
 */
export function generateFullImportSQL(
  tableDef: TableDefinition,
  rows: any[][],
  batchSize: number = 50,
  options: SmartImportOptions = { wrapInTransaction: true }
): SQLStatement[] {
  const statements: SQLStatement[] = [];
  let sequence = 0;

  // Add transaction begin if requested
  if (options.wrapInTransaction) {
    statements.push({
      type: 'BEGIN_TRANSACTION',
      sql: 'BEGIN;',
      description: 'Start transaction (rollback all on any failure)',
      sequence: sequence++
    });
  }

  // Create table
  const createTable = generateCreateTableSQL(tableDef);
  createTable.sequence = sequence++;
  statements.push(createTable);

  // Create indexes
  const indexStatements = generateIndexSQL(tableDef.name, tableDef.schema, tableDef.indexes);
  indexStatements.forEach(stmt => {
    stmt.sequence = sequence++;
    statements.push(stmt);
  });

  // Identify columns that should receive data (exclude auto-generated columns)
  const columnsWithData: { name: string; index: number }[] = [];
  tableDef.columns.forEach((col, originalIndex) => {
    // Skip auto-generated primary key columns (have defaultValue like gen_random_uuid())
    if (col.isPrimaryKey && col.defaultValue) {
      return;
    }
    columnsWithData.push({ name: col.name, index: originalIndex });
  });

  // For each row, extract only the values for columns that need data
  // The data rows correspond to the SOURCE data, not the table columns
  // If there's an auto-ID, the first column in tableDef is 'id' but the rows don't have it
  const hasAutoId = tableDef.columns[0]?.isPrimaryKey && tableDef.columns[0]?.defaultValue;
  
  const columnNames = columnsWithData.map(c => c.name);
  
  // Map the row data correctly - if there's an auto-ID, rows don't include it
  const mappedRows = rows.map(row => {
    if (hasAutoId) {
      // Rows correspond to source columns (after the auto-ID column in tableDef)
      // Just return the row as-is since it matches the non-auto columns
      return row;
    } else {
      // No auto-ID, extract columns based on their indices
      return columnsWithData.map(c => row[c.index]);
    }
  });
  
  const insertStatements = generateInsertBatchSQL(
    tableDef.name,
    tableDef.schema,
    columnNames,
    mappedRows,
    batchSize
  );
  insertStatements.forEach(stmt => {
    stmt.sequence = sequence++;
    statements.push(stmt);
  });

  // Add transaction commit if requested
  if (options.wrapInTransaction) {
    statements.push({
      type: 'COMMIT_TRANSACTION',
      sql: 'COMMIT;',
      description: 'Commit transaction',
      sequence: sequence++
    });
  }

  return statements;
}

/**
 * Infer PostgreSQL type from sample values
 */
function inferTypeFromValues(values: any[]): PostgresType {
  const nonNullValues = values.filter(v => v !== null && v !== undefined);
  if (nonNullValues.length === 0) return 'TEXT';
  
  const sample = nonNullValues[0];
  
  if (typeof sample === 'boolean') return 'BOOLEAN';
  if (typeof sample === 'number') {
    if (Number.isInteger(sample)) return 'INTEGER';
    return 'NUMERIC';
  }
  if (typeof sample === 'string') {
    // Check if it looks like a UUID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sample)) {
      return 'UUID';
    }
    // Check if it looks like a date
    if (!isNaN(Date.parse(sample)) && sample.length > 8) {
      return 'TIMESTAMP WITH TIME ZONE';
    }
    return 'TEXT';
  }
  
  return 'TEXT';
}

/**
 * Generate SQL for multiple JSON tables with proper FK ordering
 * Tables are created in parent-to-child order
 * INSERTs are done in parent-to-child order to satisfy FK constraints
 */
export function generateMultiTableImportSQL(
  tables: JsonTable[],
  relationships: ForeignKeyRelationship[],
  schema: string = 'public',
  selectedRowsByTable?: Map<string, Set<number>>,
  tableDefsMap?: Map<string, TableDefinition>,
  options: SmartImportOptions = { wrapInTransaction: true }
): SQLStatement[] {
  const statements: SQLStatement[] = [];
  let sequence = 0;

  // Add transaction begin if requested
  if (options.wrapInTransaction) {
    statements.push({
      type: 'BEGIN_TRANSACTION',
      sql: 'BEGIN;',
      description: 'Start transaction (rollback all on any failure)',
      sequence: sequence++
    });
  }

  // Build parent-child map
  const parentMap = new Map<string, string>();
  relationships.forEach(rel => {
    parentMap.set(rel.childTable, rel.parentTable);
  });

  // Sort tables: parents first, then children
  const sortedTables = [...tables].sort((a, b) => {
    // Count how many ancestors each table has
    const getDepth = (tableName: string): number => {
      let depth = 0;
      let current = tableName;
      while (parentMap.has(current)) {
        depth++;
        current = parentMap.get(current)!;
      }
      return depth;
    };
    return getDepth(a.name) - getDepth(b.name);
  });

  // ID mapping: tracks the actual ID used for each row across all tables
  // Map<tableName, Map<originalId, actualIdUsed>>
  const idMappingByTable = new Map<string, Map<string, string>>();

  // Generate CREATE TABLE for each table
  for (const table of sortedTables) {
    // Check if user has configured this table via SchemaCreator
    const userTableDef = tableDefsMap?.get(table.name);
    
    if (userTableDef) {
      // Use user-configured table definition, but ensure FK columns are preserved
      const tableDef: TableDefinition = {
        ...userTableDef,
        schema,
        columns: userTableDef.columns.map(col => {
          // Ensure _parent_id is always UUID with proper FK reference
          if (col.name === '_parent_id') {
            const parentTable = parentMap.get(table.name);
            return {
              ...col,
              type: 'UUID' as PostgresType,
              nullable: false,
              references: parentTable ? {
                table: sanitizeTableName(parentTable),
                column: 'id'
              } : undefined
            };
          }
          return col;
        })
      };
      
      const createStmt = generateCreateTableSQL(tableDef);
      createStmt.sequence = sequence++;
      statements.push(createStmt);
    } else {
      // Auto-generate table definition from JSON structure
      const columns: ColumnDefinition[] = [];
      
      // Add UUID primary key
      columns.push({
        name: 'id',
        type: 'UUID',
        nullable: false,
        isPrimaryKey: true,
        isUnique: true,
        defaultValue: 'gen_random_uuid()'
      });

      // Add columns from JSON data
      for (const col of table.columns) {
        // Skip internal _row_id column
        if (col.name === '_row_id') continue;
        
        // Handle _parent_id as a UUID FK
        if (col.name === '_parent_id') {
          const parentTable = parentMap.get(table.name);
            columns.push({
              name: '_parent_id',
              type: 'UUID',
              nullable: false,
              isPrimaryKey: false,
              isUnique: false, // NOT unique - multiple children can have same parent
              references: parentTable ? {
                table: sanitizeTableName(parentTable),
                column: 'id'
              } : undefined
            });
            continue;
        }

        // Infer type from sample values
        const inferredType = inferTypeFromValues(col.sampleValues);
        
        columns.push({
          name: col.name,
          type: inferredType,
          nullable: true,
          isPrimaryKey: false,
          isUnique: false
        });
      }

      const tableDef: TableDefinition = {
        name: table.name,
        schema,
        columns,
        indexes: []
      };

      const createStmt = generateCreateTableSQL(tableDef);
      createStmt.sequence = sequence++;
      statements.push(createStmt);
    }
  }

  // Generate INSERT statements for each table (in order)
  for (const table of sortedTables) {
    // Initialize ID mapping for this table
    const tableIdMap = new Map<string, string>();
    idMappingByTable.set(table.name, tableIdMap);
    
    // Get selected rows for this table
    let selectedRows = table.rows;
    if (selectedRowsByTable) {
      const selection = selectedRowsByTable.get(table.name);
      if (selection && selection.size > 0) {
        selectedRows = table.rows.filter((_, idx) => selection.has(idx));
      }
    }

    if (selectedRows.length === 0) continue;

    // Get parent table name for resolving _parent_id
    const parentTableName = parentMap.get(table.name);
    const parentIdMap = parentTableName ? idMappingByTable.get(parentTableName) : undefined;

    // Get columns: include 'id' explicitly using _row_id value, exclude _row_id from column list
    const columnNames = ['id', ...table.columns
      .filter(c => c.name !== '_row_id')
      .map(c => c.name)];

    // Map rows to values, using _row_id for the 'id' column
    const dataRows = selectedRows.map(row => {
      const originalId = row['_row_id'];
      
      // Determine the actual ID to use for this row
      let actualId: string;
      if (isMongoObjectId(originalId)) {
        // MongoDB ObjectId - generate a new UUID
        actualId = generateUUID();
      } else if (isValidUUID(originalId)) {
        // Already a valid UUID
        actualId = originalId;
      } else {
        // Some other format - generate UUID
        actualId = generateUUID();
      }
      
      // Store mapping for child tables
      tableIdMap.set(originalId, actualId);
      
      // Build the row data
      const rowData = [
        actualId, // Use the actual ID (converted if needed)
        ...table.columns
          .filter(c => c.name !== '_row_id')
          .map(c => {
            // Handle _parent_id - resolve to actual parent ID
            if (c.name === '_parent_id' && parentIdMap) {
              const originalParentId = row[c.name];
              const resolvedParentId = parentIdMap.get(originalParentId);
              return resolvedParentId || originalParentId; // Fallback to original if not found
            }
            return row[c.name] ?? null;
          })
      ];
      
      return rowData;
    });

    const batchSize = calculateBatchSize(columnNames.length, dataRows.length);
    const insertStmts = generateInsertBatchSQL(table.name, schema, columnNames, dataRows, batchSize);
    
    insertStmts.forEach(stmt => {
      stmt.sequence = sequence++;
      statements.push(stmt);
    });
  }

  // Add transaction commit if requested
  if (options.wrapInTransaction) {
    statements.push({
      type: 'COMMIT_TRANSACTION',
      sql: 'COMMIT;',
      description: 'Commit transaction',
      sequence: sequence++
    });
  }

  return statements;
}

/**
 * Generate table definition from inferred column types
 * Handles duplicate column names by appending suffixes
 */
export function generateTableDefinitionFromInference(
  tableName: string,
  schema: string,
  columnInfos: ColumnTypeInfo[],
  addIdColumn: boolean = true
): TableDefinition {
  const columns: ColumnDefinition[] = [];
  const indexes: IndexDefinition[] = [];
  const usedNames = new Set<string>();

  // Add auto-generated ID if requested
  if (addIdColumn) {
    columns.push({
      name: 'id',
      type: 'UUID',
      nullable: false,
      isPrimaryKey: true,
      isUnique: true,
      defaultValue: 'gen_random_uuid()'
    });
    usedNames.add('id');
  }

  for (const info of columnInfos) {
    let sanitized = sanitizeColumnName(info.name);
    
    // Handle duplicates
    let finalName = sanitized;
    let suffix = 1;
    while (usedNames.has(finalName)) {
      finalName = `${sanitized}_${suffix}`;
      suffix++;
    }
    usedNames.add(finalName);

    columns.push({
      name: finalName,
      type: info.inferredType,
      nullable: info.nullable,
      isPrimaryKey: false,
      isUnique: false
    });
  }

  return {
    name: sanitizeTableName(tableName),
    schema,
    columns,
    indexes
  };
}

/**
 * Calculate optimal batch size for INSERTs
 */
export function calculateBatchSize(columnCount: number, totalRows: number): number {
  // PostgreSQL has a limit of ~65535 parameters per query
  // Each column in each row is a parameter
  const maxParams = 32767; // Stay safe below the limit
  const maxRowsPerBatch = Math.floor(maxParams / Math.max(columnCount, 1));
  
  // Also limit to reasonable batch sizes for readability
  const preferredBatchSize = 100;
  
  return Math.min(maxRowsPerBatch, preferredBatchSize, totalRows);
}

/**
 * Generate DROP TABLE statement
 */
export function generateDropTableSQL(tableName: string, schema: string): SQLStatement {
  const sanitizedTable = sanitizeTableName(tableName);
  const fullTableName = schema ? `"${schema}"."${sanitizedTable}"` : `"${sanitizedTable}"`;
  
  return {
    type: 'DROP_TABLE',
    sql: `DROP TABLE IF EXISTS ${fullTableName} CASCADE;`,
    description: `Drop table ${sanitizedTable}`,
    sequence: 0,
    tableName: sanitizedTable
  };
}

/**
 * Generate ALTER TABLE ADD COLUMN statements
 */
export function generateAlterTableAddColumnsSQL(
  tableName: string,
  schema: string,
  columns: { name: string; type: string; nullable?: boolean }[]
): SQLStatement[] {
  const sanitizedTable = sanitizeTableName(tableName);
  const fullTableName = schema ? `"${schema}"."${sanitizedTable}"` : `"${sanitizedTable}"`;
  
  return columns.map((col, i) => {
    const nullability = col.nullable === false ? ' NOT NULL' : '';
    const sql = `ALTER TABLE ${fullTableName} ADD COLUMN IF NOT EXISTS "${sanitizeColumnName(col.name)}" ${col.type}${nullability};`;
    
    return {
      type: 'ALTER_TABLE' as const,
      sql,
      description: `Add column ${col.name} to ${sanitizedTable}`,
      sequence: i,
      tableName: sanitizedTable
    };
  });
}

import { TableMatchResult, ExistingTableSchema } from './tableMatching';

/**
 * Generate smart import SQL that respects table match decisions
 * Handles: new (CREATE+INSERT), insert (INSERT only), augment (ALTER+INSERT), skip (nothing)
 */
export function generateSmartImportSQL(
  tables: JsonTable[],
  relationships: ForeignKeyRelationship[],
  tableMatches: TableMatchResult[],
  existingSchemas: ExistingTableSchema[],
  schema: string = 'public',
  selectedRowsByTable?: Map<string, Set<number>>,
  tableDefsMap?: Map<string, TableDefinition>,
  options: SmartImportOptions = { wrapInTransaction: true }
): SQLStatement[] {
  const statements: SQLStatement[] = [];
  let sequence = 0;

  // Add transaction begin if requested
  if (options.wrapInTransaction) {
    statements.push({
      type: 'BEGIN_TRANSACTION',
      sql: 'BEGIN;',
      description: 'Start transaction (rollback all on any failure)',
      sequence: sequence++
    });
  }

  // Build parent-child map for FK ordering
  const parentMap = new Map<string, string>();
  relationships.forEach(rel => {
    parentMap.set(rel.childTable, rel.parentTable);
  });

  // Sort tables: parents first, then children
  const sortedTables = [...tables].sort((a, b) => {
    const getDepth = (tableName: string): number => {
      let depth = 0;
      let current = tableName;
      while (parentMap.has(current)) {
        depth++;
        current = parentMap.get(current)!;
      }
      return depth;
    };
    return getDepth(a.name) - getDepth(b.name);
  });

  // ID mapping: tracks the actual ID used for each row across all tables
  // Map<tableName, Map<originalId, actualIdUsed>>
  const idMappingByTable = new Map<string, Map<string, string>>();

  // Process each table based on its match status
  for (const table of sortedTables) {
    const match = tableMatches.find(m => m.importTable === table.name);
    const status = match?.status || 'new';
    
    // Skip tables marked as skip
    if (status === 'skip') continue;

    const existingTable = match?.existingTable;
    const existingSchema = existingTable 
      ? existingSchemas.find(s => s.name === existingTable)
      : undefined;

    // Get selected rows for this table
    let selectedRows = table.rows;
    if (selectedRowsByTable) {
      const selection = selectedRowsByTable.get(table.name);
      if (selection && selection.size > 0) {
        selectedRows = table.rows.filter((_, idx) => selection.has(idx));
      }
    }

    if (selectedRows.length === 0) continue;

    // Initialize ID mapping for this table
    const tableIdMap = new Map<string, string>();
    idMappingByTable.set(table.name, tableIdMap);

    // Get parent table's ID mapping for resolving _parent_id
    const parentTableName = parentMap.get(table.name);
    const parentIdMap = parentTableName ? idMappingByTable.get(parentTableName) : undefined;

    // Handle based on status
    if (status === 'new') {
      // CREATE TABLE + INSERT
      const userTableDef = tableDefsMap?.get(table.name);
      
      if (userTableDef) {
        const tableDef: TableDefinition = {
          ...userTableDef,
          schema,
          columns: userTableDef.columns.map(col => {
            if (col.name === '_parent_id') {
              const parentTable = parentMap.get(table.name);
              return {
                ...col,
                type: 'UUID' as PostgresType,
                nullable: false,
                references: parentTable ? {
                  table: sanitizeTableName(parentTable),
                  column: 'id'
                } : undefined
              };
            }
            return col;
          })
        };
        
        const createStmt = generateCreateTableSQL(tableDef);
        createStmt.sequence = sequence++;
        statements.push(createStmt);
      } else {
        // Auto-generate table definition
        const columns: ColumnDefinition[] = [];
        
        columns.push({
          name: 'id',
          type: 'UUID',
          nullable: false,
          isPrimaryKey: true,
          isUnique: true,
          defaultValue: 'gen_random_uuid()'
        });

        for (const col of table.columns) {
          if (col.name === '_row_id') continue;
          
          if (col.name === '_parent_id') {
            const parentTable = parentMap.get(table.name);
            columns.push({
              name: '_parent_id',
              type: 'UUID',
              nullable: false,
              isPrimaryKey: false,
              isUnique: false, // NOT unique - multiple children can have same parent
              references: parentTable ? {
                table: sanitizeTableName(parentTable),
                column: 'id'
              } : undefined
            });
            continue;
          }

          const inferredType = inferTypeFromValuesLocal(col.sampleValues);
          
          columns.push({
            name: col.name,
            type: inferredType,
            nullable: true,
            isPrimaryKey: false,
            isUnique: false
          });
        }

        const tableDef: TableDefinition = {
          name: table.name,
          schema,
          columns,
          indexes: []
        };

        const createStmt = generateCreateTableSQL(tableDef);
        createStmt.sequence = sequence++;
        statements.push(createStmt);
      }

      // Generate INSERTs for new table
      const columnNames = ['id', ...table.columns
        .filter(c => c.name !== '_row_id')
        .map(c => c.name)];

      const dataRows = selectedRows.map(row => {
        const originalId = row['_row_id'];
        
        // Determine the actual ID to use for this row
        let actualId: string;
        if (isMongoObjectId(originalId)) {
          actualId = generateUUID();
        } else if (isValidUUID(originalId)) {
          actualId = originalId;
        } else {
          actualId = generateUUID();
        }
        
        // Store mapping for child tables
        tableIdMap.set(originalId, actualId);
        
        return [
          actualId,
          ...table.columns
            .filter(c => c.name !== '_row_id')
            .map(c => {
              // Handle _parent_id - resolve to actual parent ID
              if (c.name === '_parent_id' && parentIdMap) {
                const originalParentId = row[c.name];
                const resolvedParentId = parentIdMap.get(originalParentId);
                return resolvedParentId || originalParentId;
              }
              return row[c.name] ?? null;
            })
        ];
      });

      const batchSize = calculateBatchSize(columnNames.length, dataRows.length);
      const insertStmts = generateInsertBatchSQL(table.name, schema, columnNames, dataRows, batchSize);
      
      insertStmts.forEach(stmt => {
        stmt.sequence = sequence++;
        statements.push(stmt);
      });
    } else if (status === 'insert' || status === 'conflict') {
      // INSERT only - use existing table structure
      // Map import columns to existing columns
      const targetTableName = existingTable || table.name;
      
      // Build column mapping from matches
      const columnMapping: { importCol: string; existingCol: string; cast?: string }[] = [];
      
      if (match && existingSchema) {
        for (const colMatch of match.columnMatches) {
          if (colMatch.existingColumn) {
            // Check for conflicts
            const conflict = match.conflicts.find(c => c.column === colMatch.importColumn);
            if (conflict) {
              if (conflict.resolution === 'skip') continue;
              if (conflict.resolution === 'block') continue;
              // cast or alter - proceed with mapping
              columnMapping.push({
                importCol: colMatch.importColumn,
                existingCol: colMatch.existingColumn,
                cast: conflict.resolution === 'cast' ? colMatch.existingType : undefined
              });
            } else {
              columnMapping.push({
                importCol: colMatch.importColumn,
                existingCol: colMatch.existingColumn
              });
            }
          }
        }
      } else {
        // No match info - use column names directly
        for (const col of table.columns) {
          if (col.name === '_row_id') continue;
          columnMapping.push({ importCol: col.name, existingCol: col.name });
        }
      }

      // Check if 'id' is already mapped from the import data (e.g., _id or id column)
      const hasIdInMapping = columnMapping.some(m => 
        m.existingCol.toLowerCase() === 'id' && 
        (m.importCol === '_id' || m.importCol === 'id' || m.importCol === '_row_id')
      );
      
      // Also check if we have any column that maps to id
      const hasAnyIdMapping = columnMapping.some(m => 
        m.existingCol.toLowerCase() === 'id'
      );
      
      // Add 'id' column mapping using _row_id only if:
      // 1. Existing table has an id column
      // 2. We don't already have any mapping to id
      const existingHasId = existingSchema?.columns.some(c => c.name.toLowerCase() === 'id');
      const shouldPrependId = existingHasId && !hasAnyIdMapping;
      
      const columnNames = shouldPrependId 
        ? ['id', ...columnMapping.map(m => m.existingCol)]
        : columnMapping.map(m => m.existingCol);

      const dataRows = selectedRows.map(row => {
        const originalId = row['_row_id'];
        
        // Determine the actual ID to use
        let actualId: string;
        if (isMongoObjectId(originalId)) {
          actualId = generateUUID();
        } else if (isValidUUID(originalId)) {
          actualId = originalId;
        } else {
          actualId = generateUUID();
        }
        
        // Store mapping for child tables
        tableIdMap.set(originalId, actualId);
        
        const mapped = columnMapping.map(m => {
          // Handle _parent_id - resolve to actual parent ID
          if (m.importCol === '_parent_id' && parentIdMap) {
            const originalParentId = row[m.importCol];
            const resolvedParentId = parentIdMap.get(originalParentId);
            return resolvedParentId || originalParentId;
          }
          const value = row[m.importCol] ?? null;
          // Apply casting if needed
          if (m.cast && value !== null) {
            return value; // Value will be cast by PostgreSQL
          }
          return value;
        });
        return shouldPrependId ? [actualId, ...mapped] : mapped;
      });

      const batchSize = calculateBatchSize(columnNames.length, dataRows.length);
      const insertStmts = generateInsertBatchSQL(targetTableName, schema, columnNames, dataRows, batchSize);
      
      insertStmts.forEach(stmt => {
        stmt.sequence = sequence++;
        statements.push(stmt);
      });
    } else if (status === 'augment') {
      // ALTER TABLE to add missing columns, then INSERT
      const targetTableName = existingTable || table.name;
      
      // Add missing columns first
      if (match && match.missingColumns.length > 0) {
        const columnsToAdd = match.missingColumns.map(colName => {
          const importCol = table.columns.find(c => c.name === colName);
          const inferredType = importCol ? inferTypeFromValuesLocal(importCol.sampleValues) : 'TEXT';
          return { name: colName, type: inferredType, nullable: true };
        });
        
        const alterStmts = generateAlterTableAddColumnsSQL(targetTableName, schema, columnsToAdd);
        alterStmts.forEach(stmt => {
          stmt.sequence = sequence++;
          statements.push(stmt);
        });
      }

      // Now insert data using all columns (existing + new)
      const columnMapping: { importCol: string; existingCol: string }[] = [];
      
      if (match) {
        for (const colMatch of match.columnMatches) {
          if (colMatch.existingColumn) {
            const conflict = match.conflicts.find(c => c.column === colMatch.importColumn);
            if (conflict && (conflict.resolution === 'skip' || conflict.resolution === 'block')) continue;
            columnMapping.push({
              importCol: colMatch.importColumn,
              existingCol: colMatch.existingColumn
            });
          }
        }
        // Add missing columns (newly added)
        for (const missingCol of match.missingColumns) {
          columnMapping.push({ importCol: missingCol, existingCol: missingCol });
        }
      }

      // Check if 'id' is already mapped
      const hasIdInMapping = columnMapping.some(m => 
        m.existingCol.toLowerCase() === 'id'
      );
      const existingHasId = existingSchema?.columns.some(c => c.name.toLowerCase() === 'id');
      const shouldPrependId = existingHasId && !hasIdInMapping;
      
      const columnNames = shouldPrependId 
        ? ['id', ...columnMapping.map(m => m.existingCol)]
        : columnMapping.map(m => m.existingCol);

      const dataRows = selectedRows.map(row => {
        const originalId = row['_row_id'];
        
        // Determine the actual ID to use
        let actualId: string;
        if (isMongoObjectId(originalId)) {
          actualId = generateUUID();
        } else if (isValidUUID(originalId)) {
          actualId = originalId;
        } else {
          actualId = generateUUID();
        }
        
        // Store mapping for child tables
        tableIdMap.set(originalId, actualId);
        
        const mapped = columnMapping.map(m => {
          // Handle _parent_id - resolve to actual parent ID
          if (m.importCol === '_parent_id' && parentIdMap) {
            const originalParentId = row[m.importCol];
            const resolvedParentId = parentIdMap.get(originalParentId);
            return resolvedParentId || originalParentId;
          }
          return row[m.importCol] ?? null;
        });
        return shouldPrependId ? [actualId, ...mapped] : mapped;
      });

      const batchSize = calculateBatchSize(columnNames.length, dataRows.length);
      const insertStmts = generateInsertBatchSQL(targetTableName, schema, columnNames, dataRows, batchSize);
      
      insertStmts.forEach(stmt => {
        stmt.sequence = sequence++;
        statements.push(stmt);
      });
    }
  }

  // Add transaction commit if we started one
  if (options.wrapInTransaction) {
    statements.push({
      type: 'COMMIT_TRANSACTION',
      sql: 'COMMIT;',
      description: 'Commit transaction',
      sequence: sequence++
    });
  }

  return statements;
}

// Local helper to infer type from values (copy to avoid circular import)
function inferTypeFromValuesLocal(values: any[]): PostgresType {
  const nonNullValues = values.filter(v => v !== null && v !== undefined);
  if (nonNullValues.length === 0) return 'TEXT';
  
  const sample = nonNullValues[0];
  
  if (typeof sample === 'boolean') return 'BOOLEAN';
  if (typeof sample === 'number') {
    if (Number.isInteger(sample)) return 'INTEGER';
    return 'NUMERIC';
  }
  if (typeof sample === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sample)) {
      return 'UUID';
    }
    if (!isNaN(Date.parse(sample)) && sample.length > 8) {
      return 'TIMESTAMP WITH TIME ZONE';
    }
    return 'TEXT';
  }
  
  return 'TEXT';
}
