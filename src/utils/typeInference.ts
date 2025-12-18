// Type inference utilities for database import

export type PostgresType = 
  | 'TEXT'
  | 'INTEGER'
  | 'BIGINT'
  | 'NUMERIC'
  | 'BOOLEAN'
  | 'DATE'
  | 'TIMESTAMP WITH TIME ZONE'
  | 'JSONB'
  | 'UUID';

export interface ColumnTypeInfo {
  name: string;
  inferredType: PostgresType;
  nullable: boolean;
  uniqueRatio: number;
  sampleValues: any[];
  castingSuccessRate: number;
  suggestPrimaryKey: boolean;
  suggestIndex: boolean;
}

export interface CastingResult {
  success: boolean;
  value: any;
  originalValue: any;
  error?: string;
}

export interface CastingRule {
  sourceColumn: string;
  targetType: PostgresType;
  nullOnFailure: boolean;
  trimWhitespace: boolean;
  dateFormat?: string;
}

/**
 * Infer the PostgreSQL type for a column based on sample values
 */
export function inferColumnType(
  values: any[],
  columnName: string,
  sampleSize: number = 1000
): ColumnTypeInfo {
  const sample = values.slice(0, sampleSize);
  const nonNullValues = sample.filter(v => v !== null && v !== undefined && v !== '');
  const nullable = nonNullValues.length < sample.length;
  
  if (nonNullValues.length === 0) {
    return {
      name: columnName,
      inferredType: 'TEXT',
      nullable: true,
      uniqueRatio: 0,
      sampleValues: sample.slice(0, 5),
      castingSuccessRate: 1,
      suggestPrimaryKey: false,
      suggestIndex: false
    };
  }

  // Calculate unique ratio for PK/index suggestions
  const uniqueValues = new Set(nonNullValues.map(v => String(v)));
  const uniqueRatio = uniqueValues.size / nonNullValues.length;

  // Try each type in order of specificity
  const typeTests: { type: PostgresType; test: (v: any) => boolean }[] = [
    { type: 'UUID', test: isUUID },
    { type: 'BOOLEAN', test: isBoolean },
    { type: 'INTEGER', test: isInteger },
    { type: 'BIGINT', test: isBigInt },
    { type: 'NUMERIC', test: isNumeric },
    { type: 'DATE', test: isDateOnly },
    { type: 'TIMESTAMP WITH TIME ZONE', test: isTimestamp },
  ];

  let inferredType: PostgresType = 'TEXT';
  let castingSuccessRate = 1;

  for (const { type, test } of typeTests) {
    const successCount = nonNullValues.filter(test).length;
    const rate = successCount / nonNullValues.length;
    
    if (rate >= 0.95) { // 95% threshold for type inference
      inferredType = type;
      castingSuccessRate = rate;
      break;
    }
  }

  // Check if values look like JSON
  if (inferredType === 'TEXT') {
    const jsonCount = nonNullValues.filter(isJsonString).length;
    if (jsonCount / nonNullValues.length >= 0.95) {
      inferredType = 'JSONB';
      castingSuccessRate = jsonCount / nonNullValues.length;
    }
  }

  // Suggest primary key if column name suggests it and high uniqueness
  const pkNamePatterns = /^(id|uuid|_id|pk|primary_key)$/i;
  const suggestPrimaryKey = pkNamePatterns.test(columnName) && uniqueRatio > 0.99 && !nullable;

  // Suggest index for high-uniqueness columns or common filter columns
  const indexNamePatterns = /(email|username|name|code|status|type|category|created|updated)/i;
  const suggestIndex = (uniqueRatio > 0.8 || indexNamePatterns.test(columnName)) && !suggestPrimaryKey;

  return {
    name: columnName,
    inferredType,
    nullable,
    uniqueRatio,
    sampleValues: nonNullValues.slice(0, 5),
    castingSuccessRate,
    suggestPrimaryKey,
    suggestIndex
  };
}

/**
 * Attempt to cast a value to the target type
 */
export function attemptCast(value: any, targetType: PostgresType, rule?: CastingRule): CastingResult {
  if (value === null || value === undefined) {
    return { success: true, value: null, originalValue: value };
  }

  let processedValue = value;
  
  // Trim whitespace if specified
  if (rule?.trimWhitespace && typeof processedValue === 'string') {
    processedValue = processedValue.trim();
  }

  // Handle empty strings
  if (processedValue === '') {
    return { success: true, value: null, originalValue: value };
  }

  try {
    switch (targetType) {
      case 'TEXT':
        return { success: true, value: String(processedValue), originalValue: value };
      
      case 'INTEGER':
        if (isInteger(processedValue)) {
          return { success: true, value: parseInt(String(processedValue), 10), originalValue: value };
        }
        break;
      
      case 'BIGINT':
        if (isBigInt(processedValue)) {
          return { success: true, value: BigInt(String(processedValue)).toString(), originalValue: value };
        }
        break;
      
      case 'NUMERIC':
        if (isNumeric(processedValue)) {
          return { success: true, value: parseFloat(String(processedValue)), originalValue: value };
        }
        break;
      
      case 'BOOLEAN':
        if (isBoolean(processedValue)) {
          return { success: true, value: toBoolean(processedValue), originalValue: value };
        }
        break;
      
      case 'DATE':
        if (isDateOnly(processedValue)) {
          return { success: true, value: toDateString(processedValue), originalValue: value };
        }
        break;
      
      case 'TIMESTAMP WITH TIME ZONE':
        if (isTimestamp(processedValue)) {
          return { success: true, value: toTimestampString(processedValue), originalValue: value };
        }
        break;
      
      case 'UUID':
        if (isUUID(processedValue)) {
          return { success: true, value: String(processedValue).toLowerCase(), originalValue: value };
        }
        break;
      
      case 'JSONB':
        if (isJsonString(processedValue)) {
          return { success: true, value: processedValue, originalValue: value };
        }
        if (typeof processedValue === 'object') {
          return { success: true, value: JSON.stringify(processedValue), originalValue: value };
        }
        break;
    }

    // If casting failed and nullOnFailure is set, return null
    if (rule?.nullOnFailure) {
      return { success: true, value: null, originalValue: value };
    }

    return { 
      success: false, 
      value: null, 
      originalValue: value,
      error: `Cannot cast "${value}" to ${targetType}`
    };
  } catch (error) {
    if (rule?.nullOnFailure) {
      return { success: true, value: null, originalValue: value };
    }
    return { 
      success: false, 
      value: null, 
      originalValue: value,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Validate all values in a column can be cast to the target type
 */
export function validateColumnCasting(
  values: any[],
  targetType: PostgresType,
  rule?: CastingRule
): { successRate: number; failures: { row: number; value: any; error: string }[] } {
  const failures: { row: number; value: any; error: string }[] = [];
  let successCount = 0;

  values.forEach((value, index) => {
    const result = attemptCast(value, targetType, rule);
    if (result.success) {
      successCount++;
    } else {
      failures.push({ row: index + 1, value, error: result.error || 'Cast failed' });
    }
  });

  return {
    successRate: values.length > 0 ? successCount / values.length : 1,
    failures
  };
}

// Type checking functions
function isUUID(value: any): boolean {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isBoolean(value: any): boolean {
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return value === 0 || value === 1;
  if (typeof value !== 'string') return false;
  const lower = value.toLowerCase().trim();
  return ['true', 'false', 'yes', 'no', '1', '0', 't', 'f', 'y', 'n'].includes(lower);
}

function isInteger(value: any): boolean {
  if (typeof value === 'number') return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return false;
  const num = parseInt(trimmed, 10);
  return num >= -2147483648 && num <= 2147483647;
}

function isBigInt(value: any): boolean {
  if (typeof value === 'number') return Number.isInteger(value);
  if (typeof value === 'bigint') return true;
  if (typeof value !== 'string') return false;
  return /^-?\d+$/.test(value.trim());
}

function isNumeric(value: any): boolean {
  if (typeof value === 'number') return !isNaN(value);
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return !isNaN(parseFloat(trimmed)) && isFinite(parseFloat(trimmed));
}

function isDateOnly(value: any): boolean {
  if (value instanceof Date) return true;
  if (typeof value !== 'string') return false;
  // Match common date formats: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}$/,
    /^\d{2}\/\d{2}\/\d{4}$/,
    /^\d{2}-\d{2}-\d{4}$/
  ];
  const trimmed = value.trim();
  if (!datePatterns.some(p => p.test(trimmed))) return false;
  const parsed = new Date(trimmed);
  return !isNaN(parsed.getTime());
}

function isTimestamp(value: any): boolean {
  if (value instanceof Date) return true;
  if (typeof value !== 'string') return false;
  // More permissive - includes time component
  const trimmed = value.trim();
  const parsed = new Date(trimmed);
  return !isNaN(parsed.getTime()) && trimmed.length > 10;
}

function isJsonString(value: any): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if ((!trimmed.startsWith('{') || !trimmed.endsWith('}')) && 
      (!trimmed.startsWith('[') || !trimmed.endsWith(']'))) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

// Conversion functions
function toBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const lower = String(value).toLowerCase().trim();
  return ['true', 'yes', '1', 't', 'y'].includes(lower);
}

function toDateString(value: any): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().split('T')[0];
}

function toTimestampString(value: any): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

/**
 * Generate PostgreSQL column definition
 */
export function generateColumnDefinition(
  name: string,
  type: PostgresType,
  nullable: boolean,
  isPrimaryKey: boolean = false,
  isUnique: boolean = false,
  defaultValue?: string
): string {
  const parts = [
    `"${name}"`,
    type
  ];

  if (isPrimaryKey) {
    parts.push('PRIMARY KEY');
  } else {
    if (!nullable) {
      parts.push('NOT NULL');
    }
    if (isUnique) {
      parts.push('UNIQUE');
    }
  }

  if (defaultValue !== undefined) {
    parts.push(`DEFAULT ${defaultValue}`);
  }

  return parts.join(' ');
}
