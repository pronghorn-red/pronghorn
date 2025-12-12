import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RENDER_API_URL = "https://api.render.com/v1";

interface ManageDatabaseRequest {
  action: 'get_schema' | 'execute_sql' | 'get_table_data' | 'get_table_columns' | 'export_table' 
    | 'get_table_definition' | 'get_view_definition' | 'get_function_definition' 
    | 'get_trigger_definition' | 'get_index_definition' | 'get_sequence_info' | 'get_type_definition';
  databaseId: string;
  shareToken?: string;
  // For execute_sql
  sql?: string;
  // For get_table_data and definitions
  schema?: string;
  table?: string;
  name?: string; // For functions, triggers, indexes, sequences, types
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
  // For export_table
  format?: 'json' | 'csv' | 'sql';
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RENDER_API_KEY = Deno.env.get("RENDER_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!RENDER_API_KEY) {
      throw new Error("RENDER_API_KEY must be configured");
    }

    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    const body: ManageDatabaseRequest = await req.json();
    const { action, databaseId, shareToken } = body;

    console.log(`[manage-database] Action: ${action}, Database ID: ${databaseId}`);

    if (!databaseId) {
      throw new Error("databaseId is required");
    }

    // Fetch database record and validate access
    const { data: database, error: dbError } = await supabase.rpc("get_database_with_token", {
      p_database_id: databaseId,
      p_token: shareToken || null,
    });

    if (dbError || !database) {
      console.error("[manage-database] Database fetch error:", dbError);
      throw new Error(dbError?.message || "Database not found or access denied");
    }

    // Get role for permission checking
    const { data: role, error: roleError } = await supabase.rpc("authorize_project_access", {
      p_project_id: database.project_id,
      p_token: shareToken || null,
    });

    if (roleError) {
      throw new Error("Access denied");
    }

    // Check if database is available
    if (!database.render_postgres_id || database.status !== "available") {
      throw new Error("Database is not available. Status: " + database.status);
    }

    // Get connection string from Render API
    const renderHeaders = {
      "Authorization": `Bearer ${RENDER_API_KEY}`,
      "Content-Type": "application/json",
    };

    const connResponse = await fetch(
      `${RENDER_API_URL}/postgres/${database.render_postgres_id}/connection-info`,
      { method: "GET", headers: renderHeaders }
    );

    if (!connResponse.ok) {
      const errorText = await connResponse.text();
      throw new Error(`Failed to get connection info: ${errorText}`);
    }

    const connInfo = await connResponse.json();
    const connectionString = connInfo.externalConnectionString;

    if (!connectionString) {
      throw new Error("No external connection string available");
    }

    let result: any;

    switch (action) {
      case 'get_schema':
        result = await getSchema(connectionString);
        break;
      case 'execute_sql':
        // Require editor role for SQL execution
        if (role !== 'owner' && role !== 'editor') {
          throw new Error("Editor or owner role required for SQL execution");
        }
        if (!body.sql) {
          throw new Error("SQL query is required");
        }
        // Validate query for destructive operations
        const sqlQuery = body.sql;
        const destructivePatterns = [
          /^\s*DROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW|FUNCTION|TRIGGER|SEQUENCE)/i,
          /^\s*TRUNCATE\s+/i,
          /^\s*DELETE\s+FROM\s+.*(?!WHERE)/i, // DELETE without WHERE
          /^\s*ALTER\s+TABLE\s+.*\s+DROP\s+/i,
        ];
        
        const isDestructive = destructivePatterns.some(pattern => pattern.test(sqlQuery));
        if (isDestructive && role !== 'owner') {
          throw new Error("Destructive queries (DROP, TRUNCATE, DELETE without WHERE) require owner role");
        }
        
        result = await executeSql(connectionString, sqlQuery);
        break;
      case 'get_table_data':
        if (!body.schema || !body.table) {
          throw new Error("Schema and table are required");
        }
        result = await getTableData(
          connectionString,
          body.schema,
          body.table,
          body.limit || 100,
          body.offset || 0,
          body.orderBy,
          body.orderDir
        );
        break;
      case 'get_table_columns':
        if (!body.schema || !body.table) {
          throw new Error("Schema and table are required");
        }
        result = await getTableColumns(connectionString, body.schema, body.table);
        break;
      case 'export_table':
        if (!body.schema || !body.table) {
          throw new Error("Schema and table are required");
        }
        result = await exportTable(
          connectionString,
          body.schema,
          body.table,
          body.format || 'json'
        );
        break;
      case 'get_table_definition':
        if (!body.schema || !body.table) {
          throw new Error("Schema and table are required");
        }
        result = await getTableDefinition(connectionString, body.schema, body.table);
        break;
      case 'get_view_definition':
        if (!body.schema || !body.name) {
          throw new Error("Schema and view name are required");
        }
        result = await getViewDefinition(connectionString, body.schema, body.name);
        break;
      case 'get_function_definition':
        if (!body.schema || !body.name) {
          throw new Error("Schema and function name are required");
        }
        result = await getFunctionDefinition(connectionString, body.schema, body.name);
        break;
      case 'get_trigger_definition':
        if (!body.schema || !body.name) {
          throw new Error("Schema and trigger name are required");
        }
        result = await getTriggerDefinition(connectionString, body.schema, body.name);
        break;
      case 'get_index_definition':
        if (!body.schema || !body.name) {
          throw new Error("Schema and index name are required");
        }
        result = await getIndexDefinition(connectionString, body.schema, body.name);
        break;
      case 'get_sequence_info':
        if (!body.schema || !body.name) {
          throw new Error("Schema and sequence name are required");
        }
        result = await getSequenceInfo(connectionString, body.schema, body.name);
        break;
      case 'get_type_definition':
        if (!body.schema || !body.name) {
          throw new Error("Schema and type name are required");
        }
        result = await getTypeDefinition(connectionString, body.schema, body.name);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[manage-database] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function getSchema(connectionString: string) {
  const client = new Client(connectionString);
  await client.connect();

  try {
    // Get all schemas (excluding system schemas)
    const schemasResult = await client.queryObject<{ schema_name: string }>`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name
    `;

    const schemas: any[] = [];

    for (const schemaRow of schemasResult.rows) {
      const schemaName = schemaRow.schema_name;

      // Get tables
      const tablesResult = await client.queryObject<{ table_name: string; table_type: string }>`
        SELECT table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = ${schemaName}
        ORDER BY table_name
      `;

      const tables = tablesResult.rows.filter(t => t.table_type === 'BASE TABLE').map(t => t.table_name);
      const views = tablesResult.rows.filter(t => t.table_type === 'VIEW').map(t => t.table_name);

      // Get functions
      const functionsResult = await client.queryObject<{ routine_name: string; routine_type: string }>`
        SELECT routine_name, routine_type
        FROM information_schema.routines
        WHERE routine_schema = ${schemaName}
        ORDER BY routine_name
      `;

      const functions = functionsResult.rows.filter(f => f.routine_type === 'FUNCTION').map(f => f.routine_name);
      const procedures = functionsResult.rows.filter(f => f.routine_type === 'PROCEDURE').map(f => f.routine_name);

      // Get triggers
      const triggersResult = await client.queryObject<{ trigger_name: string; event_object_table: string }>`
        SELECT trigger_name, event_object_table
        FROM information_schema.triggers
        WHERE trigger_schema = ${schemaName}
        ORDER BY trigger_name
      `;

      const triggers = triggersResult.rows.map(t => ({
        name: t.trigger_name,
        table: t.event_object_table,
      }));

      // Get indexes
      const indexesResult = await client.queryObject<{ indexname: string; tablename: string; indexdef: string }>`
        SELECT indexname, tablename, indexdef
        FROM pg_indexes
        WHERE schemaname = ${schemaName}
        ORDER BY tablename, indexname
      `;

      const indexes = indexesResult.rows.map(i => ({
        name: i.indexname,
        table: i.tablename,
        definition: i.indexdef,
      }));

      // Get sequences
      const sequencesResult = await client.queryObject<{ sequence_name: string }>`
        SELECT sequence_name
        FROM information_schema.sequences
        WHERE sequence_schema = ${schemaName}
        ORDER BY sequence_name
      `;

      const sequences = sequencesResult.rows.map(s => s.sequence_name);

      // Get custom types
      const typesResult = await client.queryObject<{ typname: string; typtype: string }>`
        SELECT t.typname, t.typtype
        FROM pg_type t
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE n.nspname = ${schemaName}
        AND t.typtype IN ('e', 'c', 'd', 'r')
        ORDER BY t.typname
      `;

      const types = typesResult.rows.map(t => ({
        name: t.typname,
        type: t.typtype === 'e' ? 'enum' : t.typtype === 'c' ? 'composite' : t.typtype === 'd' ? 'domain' : 'range',
      }));

      // Get constraints
      const constraintsResult = await client.queryObject<{ constraint_name: string; table_name: string; constraint_type: string }>`
        SELECT constraint_name, table_name, constraint_type
        FROM information_schema.table_constraints
        WHERE constraint_schema = ${schemaName}
        ORDER BY table_name, constraint_name
      `;

      const constraints = constraintsResult.rows.map(c => ({
        name: c.constraint_name,
        table: c.table_name,
        type: c.constraint_type,
      }));

      schemas.push({
        name: schemaName,
        tables,
        views,
        functions,
        procedures,
        triggers,
        indexes,
        sequences,
        types,
        constraints,
      });
    }

    return { schemas };
  } finally {
    await client.end();
  }
}

async function executeSql(connectionString: string, sql: string) {
  const client = new Client(connectionString);
  await client.connect();

  try {
    const startTime = Date.now();
    const result = await client.queryObject(sql);
    const executionTime = Date.now() - startTime;

    return {
      rows: result.rows,
      rowCount: result.rows.length,
      columns: result.columns || [],
      executionTime,
    };
  } finally {
    await client.end();
  }
}

async function getTableData(
  connectionString: string,
  schema: string,
  table: string,
  limit: number,
  offset: number,
  orderBy?: string,
  orderDir?: 'asc' | 'desc'
) {
  const client = new Client(connectionString);
  await client.connect();

  try {
    // Sanitize inputs
    const safeSchema = schema.replace(/[^a-zA-Z0-9_]/g, '');
    const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
    const safeLimit = Math.min(Math.max(1, limit), 1000);
    const safeOffset = Math.max(0, offset);

    // Build query
    let query = `SELECT * FROM "${safeSchema}"."${safeTable}"`;
    
    if (orderBy) {
      const safeOrderBy = orderBy.replace(/[^a-zA-Z0-9_]/g, '');
      const dir = orderDir === 'desc' ? 'DESC' : 'ASC';
      query += ` ORDER BY "${safeOrderBy}" ${dir}`;
    }
    
    query += ` LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const result = await client.queryObject(query);
    const columns = result.rows.length > 0 ? Object.keys(result.rows[0] as object) : [];

    // Get total count
    const countResult = await client.queryObject<{ count: number }>(
      `SELECT COUNT(*) as count FROM "${safeSchema}"."${safeTable}"`
    );
    const totalRows = Number(countResult.rows[0]?.count || 0);

    return {
      rows: result.rows,
      columns,
      totalRows,
      limit: safeLimit,
      offset: safeOffset,
    };
  } finally {
    await client.end();
  }
}

async function getTableColumns(connectionString: string, schema: string, table: string) {
  const client = new Client(connectionString);
  await client.connect();

  try {
    const result = await client.queryObject<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
      character_maximum_length: number | null;
    }>`
      SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = ${schema} AND table_name = ${table}
      ORDER BY ordinal_position
    `;

    return {
      columns: result.rows.map(c => ({
        name: c.column_name,
        type: c.data_type,
        nullable: c.is_nullable === 'YES',
        default: c.column_default,
        maxLength: c.character_maximum_length,
      })),
    };
  } finally {
    await client.end();
  }
}

async function exportTable(
  connectionString: string,
  schema: string,
  table: string,
  format: 'json' | 'csv' | 'sql'
) {
  const client = new Client(connectionString);
  await client.connect();

  try {
    const safeSchema = schema.replace(/[^a-zA-Z0-9_]/g, '');
    const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');

    const result = await client.queryObject(`SELECT * FROM "${safeSchema}"."${safeTable}"`);
    const columns = result.columns || [];

    if (format === 'json') {
      return {
        format: 'json',
        data: result.rows,
        rowCount: result.rows.length,
      };
    }

    if (format === 'csv') {
      const header = columns.join(',');
      const rows = result.rows.map((row: any) =>
        columns.map(col => {
          const val = row[col];
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(',')
      );
      return {
        format: 'csv',
        data: [header, ...rows].join('\n'),
        rowCount: result.rows.length,
      };
    }

    if (format === 'sql') {
      const statements = result.rows.map((row: any) => {
        const values = columns.map(col => {
          const val = row[col];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number') return String(val);
          if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
          return `'${String(val).replace(/'/g, "''")}'`;
        });
        return `INSERT INTO "${safeSchema}"."${safeTable}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});`;
      });
      return {
        format: 'sql',
        data: statements.join('\n'),
        rowCount: result.rows.length,
      };
    }

    throw new Error(`Unsupported format: ${format}`);
  } finally {
    await client.end();
  }
}

async function getTableDefinition(connectionString: string, schema: string, table: string) {
  const client = new Client(connectionString);
  await client.connect();

  try {
    // Get columns
    const columnsResult = await client.queryObject<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
      character_maximum_length: number | null;
    }>`
      SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = ${schema} AND table_name = ${table}
      ORDER BY ordinal_position
    `;

    // Get primary key columns
    const pkResult = await client.queryObject<{ column_name: string }>`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = ${schema}
        AND tc.table_name = ${table}
    `;
    const pkColumns = new Set(pkResult.rows.map(r => r.column_name));

    // Build CREATE TABLE statement
    const columnDefs = columnsResult.rows.map(col => {
      let def = `  "${col.column_name}" ${col.data_type}`;
      if (col.character_maximum_length) {
        def += `(${col.character_maximum_length})`;
      }
      if (col.is_nullable === 'NO') {
        def += ' NOT NULL';
      }
      if (col.column_default) {
        def += ` DEFAULT ${col.column_default}`;
      }
      if (pkColumns.has(col.column_name)) {
        def += ' PRIMARY KEY';
      }
      return def;
    });

    const createStatement = `CREATE TABLE "${schema}"."${table}" (\n${columnDefs.join(',\n')}\n);`;

    return {
      definition: createStatement,
      columns: columnsResult.rows,
    };
  } finally {
    await client.end();
  }
}

async function getViewDefinition(connectionString: string, schema: string, viewName: string) {
  const client = new Client(connectionString);
  await client.connect();

  try {
    const result = await client.queryObject<{ view_definition: string }>`
      SELECT view_definition
      FROM information_schema.views
      WHERE table_schema = ${schema} AND table_name = ${viewName}
    `;

    if (result.rows.length === 0) {
      throw new Error(`View ${schema}.${viewName} not found`);
    }

    const viewDef = result.rows[0].view_definition;
    const createStatement = `CREATE OR REPLACE VIEW "${schema}"."${viewName}" AS\n${viewDef}`;

    return { definition: createStatement };
  } finally {
    await client.end();
  }
}

async function getFunctionDefinition(connectionString: string, schema: string, funcName: string) {
  const client = new Client(connectionString);
  await client.connect();

  try {
    const result = await client.queryObject<{ definition: string }>`
      SELECT pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = ${schema} AND p.proname = ${funcName}
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      throw new Error(`Function ${schema}.${funcName} not found`);
    }

    return { definition: result.rows[0].definition };
  } finally {
    await client.end();
  }
}

async function getTriggerDefinition(connectionString: string, schema: string, triggerName: string) {
  const client = new Client(connectionString);
  await client.connect();

  try {
    const result = await client.queryObject<{
      trigger_name: string;
      event_manipulation: string;
      event_object_table: string;
      action_statement: string;
      action_timing: string;
    }>`
      SELECT trigger_name, event_manipulation, event_object_table, action_statement, action_timing
      FROM information_schema.triggers
      WHERE trigger_schema = ${schema} AND trigger_name = ${triggerName}
    `;

    if (result.rows.length === 0) {
      throw new Error(`Trigger ${schema}.${triggerName} not found`);
    }

    const t = result.rows[0];
    const createStatement = `CREATE TRIGGER "${t.trigger_name}"\n${t.action_timing} ${t.event_manipulation}\nON "${schema}"."${t.event_object_table}"\n${t.action_statement}`;

    return { definition: createStatement };
  } finally {
    await client.end();
  }
}

async function getIndexDefinition(connectionString: string, schema: string, indexName: string) {
  const client = new Client(connectionString);
  await client.connect();

  try {
    const result = await client.queryObject<{ indexdef: string }>`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = ${schema} AND indexname = ${indexName}
    `;

    if (result.rows.length === 0) {
      throw new Error(`Index ${schema}.${indexName} not found`);
    }

    return { definition: result.rows[0].indexdef + ';' };
  } finally {
    await client.end();
  }
}

async function getSequenceInfo(connectionString: string, schema: string, seqName: string) {
  const client = new Client(connectionString);
  await client.connect();

  try {
    const safeSchema = schema.replace(/[^a-zA-Z0-9_]/g, '');
    const safeSeq = seqName.replace(/[^a-zA-Z0-9_]/g, '');
    
    const result = await client.queryObject<{
      last_value: bigint;
      start_value: bigint;
      increment_by: bigint;
      max_value: bigint;
      min_value: bigint;
      cache_value: bigint;
      is_cycled: boolean;
    }>(`SELECT * FROM "${safeSchema}"."${safeSeq}"`);

    if (result.rows.length === 0) {
      throw new Error(`Sequence ${schema}.${seqName} not found`);
    }

    const seq = result.rows[0];
    const createStatement = `CREATE SEQUENCE "${schema}"."${seqName}"\n  START WITH ${seq.start_value}\n  INCREMENT BY ${seq.increment_by}\n  MINVALUE ${seq.min_value}\n  MAXVALUE ${seq.max_value}\n  CACHE ${seq.cache_value}${seq.is_cycled ? '\n  CYCLE' : ''};`;

    return { 
      definition: createStatement,
      lastValue: seq.last_value,
    };
  } finally {
    await client.end();
  }
}

async function getTypeDefinition(connectionString: string, schema: string, typeName: string) {
  const client = new Client(connectionString);
  await client.connect();

  try {
    // Check if it's an enum
    const enumResult = await client.queryObject<{ enumlabel: string }>`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname = ${schema} AND t.typname = ${typeName}
      ORDER BY e.enumsortorder
    `;

    if (enumResult.rows.length > 0) {
      const values = enumResult.rows.map(r => `'${r.enumlabel}'`).join(', ');
      return { definition: `CREATE TYPE "${schema}"."${typeName}" AS ENUM (${values});` };
    }

    // Check if it's a composite type
    const compositeResult = await client.queryObject<{ attname: string; typname: string }>`
      SELECT a.attname, t.typname
      FROM pg_type ct
      JOIN pg_namespace n ON ct.typnamespace = n.oid
      JOIN pg_attribute a ON a.attrelid = ct.typrelid
      JOIN pg_type t ON a.atttypid = t.oid
      WHERE n.nspname = ${schema} AND ct.typname = ${typeName}
        AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum
    `;

    if (compositeResult.rows.length > 0) {
      const fields = compositeResult.rows.map(r => `  "${r.attname}" ${r.typname}`).join(',\n');
      return { definition: `CREATE TYPE "${schema}"."${typeName}" AS (\n${fields}\n);` };
    }

    throw new Error(`Type ${schema}.${typeName} not found or unsupported type`);
  } finally {
    await client.end();
  }
}
