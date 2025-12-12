import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RENDER_API_URL = "https://api.render.com/v1";

interface ManageDatabaseRequest {
  action: 'get_schema' | 'execute_sql' | 'get_table_data' | 'get_table_columns' | 'export_table';
  databaseId: string;
  shareToken?: string;
  // For execute_sql
  sql?: string;
  // For get_table_data
  schema?: string;
  table?: string;
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
        result = await executeSql(connectionString, body.sql);
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
