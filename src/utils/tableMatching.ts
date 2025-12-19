// Table matching utilities for smart import

import { JsonTable } from './parseJson';
import { PostgresType } from './typeInference';

export interface ExistingTableSchema {
  name: string;
  columns: ExistingColumn[];
}

export interface ExistingColumn {
  name: string;
  type: string;
  nullable: boolean;
}

export interface ColumnMatchResult {
  importColumn: string;
  existingColumn?: string;
  typeMatch: boolean;
  importType: string;
  existingType?: string;
}

export interface ColumnConflict {
  column: string;
  importType: string;
  existingType: string;
  resolution: 'skip' | 'cast' | 'alter' | 'block';
}

export interface TableMatchResult {
  importTable: string;
  matchType: 'exact' | 'partial' | 'name_only' | 'new';
  existingTable?: string;
  matchScore: number; // 0-100
  columnMatches: ColumnMatchResult[];
  conflicts: ColumnConflict[];
  missingColumns: string[];  // Columns in import but not in existing
  extraColumns: string[];    // Columns in existing but not in import
  status: 'new' | 'insert' | 'conflict' | 'skip';
}

// Normalize type names for comparison
function normalizeType(type: string): string {
  const t = type.toLowerCase().trim();
  
  // UUID variations
  if (t === 'uuid') return 'uuid';
  
  // Integer variations
  if (t.includes('int') || t === 'bigint' || t === 'smallint') return 'integer';
  
  // Numeric variations
  if (t.includes('numeric') || t.includes('decimal') || t === 'real' || t.includes('double')) return 'numeric';
  
  // Text variations
  if (t === 'text' || t.includes('varchar') || t.includes('char')) return 'text';
  
  // Boolean variations
  if (t === 'boolean' || t === 'bool') return 'boolean';
  
  // Timestamp variations
  if (t.includes('timestamp')) return 'timestamp';
  
  // Date variations
  if (t === 'date') return 'date';
  
  // JSON variations
  if (t === 'json' || t === 'jsonb') return 'json';
  
  return t;
}

// Check if types are compatible for insertion
function areTypesCompatible(importType: string, existingType: string): boolean {
  const normImport = normalizeType(importType);
  const normExisting = normalizeType(existingType);
  
  if (normImport === normExisting) return true;
  
  // Text can accept most types
  if (normExisting === 'text') return true;
  
  // Numeric can accept integers
  if (normExisting === 'numeric' && normImport === 'integer') return true;
  
  // Timestamp can accept date
  if (normExisting === 'timestamp' && normImport === 'date') return true;
  
  // JSON can accept text
  if (normExisting === 'json' && normImport === 'text') return true;
  
  return false;
}

// Normalize table name for matching
function normalizeTableName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Find fuzzy match for a table name
function findFuzzyMatch(importName: string, existingTables: ExistingTableSchema[]): ExistingTableSchema | undefined {
  const normalizedImport = normalizeTableName(importName);
  
  for (const existing of existingTables) {
    const normalizedExisting = normalizeTableName(existing.name);
    
    // Exact match after normalization
    if (normalizedImport === normalizedExisting) {
      return existing;
    }
    
    // One contains the other
    if (normalizedImport.includes(normalizedExisting) || normalizedExisting.includes(normalizedImport)) {
      // Only match if significant overlap
      const shorter = Math.min(normalizedImport.length, normalizedExisting.length);
      const longer = Math.max(normalizedImport.length, normalizedExisting.length);
      if (shorter / longer > 0.6) {
        return existing;
      }
    }
  }
  
  return undefined;
}

// Analyze columns between import and existing table
function analyzeColumns(
  importColumns: { name: string; type: string }[],
  existingColumns: ExistingColumn[]
): {
  matches: ColumnMatchResult[];
  conflicts: ColumnConflict[];
  missing: string[];
  extra: string[];
  score: number;
} {
  const matches: ColumnMatchResult[] = [];
  const conflicts: ColumnConflict[] = [];
  const missing: string[] = [];
  const extra: string[] = [];
  
  const existingByName = new Map<string, ExistingColumn>();
  const existingByNormalizedName = new Map<string, ExistingColumn>();
  existingColumns.forEach(col => {
    existingByName.set(col.name.toLowerCase(), col);
    existingByNormalizedName.set(col.name.toLowerCase().replace(/[^a-z0-9]/g, ''), col);
  });
  
  const matchedExisting = new Set<string>();
  
  for (const importCol of importColumns) {
    // Skip internal columns
    if (importCol.name === '_row_id' || importCol.name === '_parent_id') continue;
    
    const normalizedImportName = importCol.name.toLowerCase();
    const fuzzyImportName = normalizedImportName.replace(/[^a-z0-9]/g, '');
    
    // Try exact match first
    let existingCol = existingByName.get(normalizedImportName);
    
    // Try fuzzy match
    if (!existingCol) {
      existingCol = existingByNormalizedName.get(fuzzyImportName);
    }
    
    if (existingCol) {
      matchedExisting.add(existingCol.name.toLowerCase());
      const typeMatch = areTypesCompatible(importCol.type, existingCol.type);
      
      matches.push({
        importColumn: importCol.name,
        existingColumn: existingCol.name,
        typeMatch,
        importType: importCol.type,
        existingType: existingCol.type
      });
      
      if (!typeMatch) {
        conflicts.push({
          column: importCol.name,
          importType: importCol.type,
          existingType: existingCol.type,
          resolution: 'cast' // Default to cast, user can change
        });
      }
    } else {
      missing.push(importCol.name);
      matches.push({
        importColumn: importCol.name,
        existingColumn: undefined,
        typeMatch: false,
        importType: importCol.type,
        existingType: undefined
      });
    }
  }
  
  // Find extra columns (in existing but not in import)
  for (const existingCol of existingColumns) {
    if (!matchedExisting.has(existingCol.name.toLowerCase())) {
      // Ignore 'id' column as it's usually auto-generated
      if (existingCol.name.toLowerCase() !== 'id') {
        extra.push(existingCol.name);
      }
    }
  }
  
  // Calculate match score
  const totalImportColumns = importColumns.filter(c => c.name !== '_row_id' && c.name !== '_parent_id').length;
  const matchedColumns = matches.filter(m => m.existingColumn && m.typeMatch).length;
  const score = totalImportColumns > 0 ? Math.round((matchedColumns / totalImportColumns) * 100) : 0;
  
  return { matches, conflicts, missing, extra, score };
}

// Infer column type from sample values (for import tables)
function inferColumnType(sampleValues: any[]): string {
  const nonNull = sampleValues.filter(v => v !== null && v !== undefined);
  if (nonNull.length === 0) return 'TEXT';
  
  const sample = nonNull[0];
  
  if (typeof sample === 'boolean') return 'BOOLEAN';
  if (typeof sample === 'number') {
    return Number.isInteger(sample) ? 'INTEGER' : 'NUMERIC';
  }
  if (typeof sample === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sample)) {
      return 'UUID';
    }
    if (!isNaN(Date.parse(sample)) && sample.length > 8) {
      return 'TIMESTAMP WITH TIME ZONE';
    }
  }
  if (typeof sample === 'object') return 'JSONB';
  
  return 'TEXT';
}

/**
 * Match import tables against existing database tables
 */
export function matchTables(
  importTables: JsonTable[],
  existingTables: ExistingTableSchema[]
): TableMatchResult[] {
  return importTables.map(importTable => {
    // Convert import columns to format needed for analysis
    const importColumns = importTable.columns.map(col => ({
      name: col.name,
      type: inferColumnType(col.sampleValues)
    }));
    
    // 1. Try exact name match
    const exactMatch = existingTables.find(
      e => e.name.toLowerCase() === importTable.name.toLowerCase()
    );
    
    if (exactMatch) {
      const columnAnalysis = analyzeColumns(importColumns, exactMatch.columns);
      const hasConflicts = columnAnalysis.conflicts.length > 0;
      
      return {
        importTable: importTable.name,
        matchType: columnAnalysis.score === 100 ? 'exact' : 'partial',
        existingTable: exactMatch.name,
        matchScore: columnAnalysis.score,
        columnMatches: columnAnalysis.matches,
        conflicts: columnAnalysis.conflicts,
        missingColumns: columnAnalysis.missing,
        extraColumns: columnAnalysis.extra,
        status: hasConflicts ? 'conflict' : 'insert'
      };
    }
    
    // 2. Try fuzzy name match
    const fuzzyMatch = findFuzzyMatch(importTable.name, existingTables);
    if (fuzzyMatch) {
      const columnAnalysis = analyzeColumns(importColumns, fuzzyMatch.columns);
      const hasConflicts = columnAnalysis.conflicts.length > 0;
      
      return {
        importTable: importTable.name,
        matchType: 'name_only',
        existingTable: fuzzyMatch.name,
        matchScore: Math.round(columnAnalysis.score * 0.8), // Reduce score for fuzzy match
        columnMatches: columnAnalysis.matches,
        conflicts: columnAnalysis.conflicts,
        missingColumns: columnAnalysis.missing,
        extraColumns: columnAnalysis.extra,
        status: hasConflicts ? 'conflict' : 'insert'
      };
    }
    
    // 3. No match - new table
    return {
      importTable: importTable.name,
      matchType: 'new',
      matchScore: 0,
      columnMatches: [],
      conflicts: [],
      missingColumns: [],
      extraColumns: [],
      status: 'new'
    };
  });
}

/**
 * Get a summary of the matching results
 */
export function getMatchingSummary(matches: TableMatchResult[]): {
  newTables: number;
  insertTables: number;
  conflictTables: number;
  skipTables: number;
} {
  return {
    newTables: matches.filter(m => m.status === 'new').length,
    insertTables: matches.filter(m => m.status === 'insert').length,
    conflictTables: matches.filter(m => m.status === 'conflict').length,
    skipTables: matches.filter(m => m.status === 'skip').length
  };
}

/**
 * Update table match resolution
 */
export function updateMatchResolution(
  matches: TableMatchResult[],
  tableName: string,
  newStatus: 'new' | 'insert' | 'conflict' | 'skip'
): TableMatchResult[] {
  return matches.map(m => 
    m.importTable === tableName ? { ...m, status: newStatus } : m
  );
}

/**
 * Update conflict resolution for a specific column
 */
export function updateConflictResolution(
  matches: TableMatchResult[],
  tableName: string,
  columnName: string,
  resolution: 'skip' | 'cast' | 'alter' | 'block'
): TableMatchResult[] {
  return matches.map(m => {
    if (m.importTable !== tableName) return m;
    
    const updatedConflicts = m.conflicts.map(c => 
      c.column === columnName ? { ...c, resolution } : c
    );
    
    // Update status based on conflicts
    const hasBlockingConflicts = updatedConflicts.some(c => c.resolution === 'block');
    const status = hasBlockingConflicts ? 'conflict' : 'insert';
    
    return { ...m, conflicts: updatedConflicts, status };
  });
}
