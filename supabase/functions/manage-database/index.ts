import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Client } from "jsr:@db/postgres@0.19.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RENDER_API_URL = "https://api.render.com/v1";
const ENCRYPTION_KEY = Deno.env.get('SECRETS_ENCRYPTION_KEY');

// ============== Encryption/Decryption Helpers ==============

/**
 * Ensure the password in a connection string is properly URL-encoded.
 * Assumes the password is NOT already encoded (raw password with special characters).
 * This handles passwords with special chars like ^, >, %, }, ], etc.
 */
function ensurePasswordEncoded(connectionString: string): string {
  try {
    // Parse the URL - convert postgres: to postgresql: for URL parsing
    const urlString = connectionString.replace(/^postgres:\/\//, 'postgresql://');
    const url = new URL(urlString);
    
    // If there's a password, we need to re-encode it properly
    // The URL constructor will have decoded any existing encoding, but we're assuming
    // the user provided a raw password (not encoded), so we take what's there and encode it
    if (url.password) {
      // The password from URL might have been partially decoded by URL constructor
      // We'll encode it fresh, treating it as the raw password
      const rawPassword = url.password;
      const encodedPassword = encodeURIComponent(rawPassword);
      url.password = encodedPassword;
    }
    
    // If no database specified, default to 'postgres' to avoid "Missing connection parameters: database" error
    if (!url.pathname || url.pathname === '/') {
      url.pathname = '/postgres';
    }
    
    // Return the fixed connection string (convert back to postgres:// if needed)
    let result = url.toString();
    if (connectionString.startsWith('postgres://')) {
      result = result.replace(/^postgresql:\/\//, 'postgres://');
    }
    return result;
  } catch (error) {
    console.warn('[manage-database] Could not parse connection string for encoding:', error);
    // Return original if parsing fails
    return connectionString;
  }
}

/**
 * Extract sslmode from connection string URL parameters.
 * deno-postgres ignores sslmode in URL, so we need to parse it manually.
 */
function extractSslMode(connectionString: string): string {
  try {
    const url = new URL(connectionString.replace(/^postgres:\/\//, 'postgresql://'));
    return url.searchParams.get('sslmode') || 'prefer';
  } catch {
    return 'prefer';
  }
}

interface TlsOptions {
  enabled: boolean;
  enforce: boolean;
  caCertificates?: string[];
}

/**
 * Get TLS options for deno-postgres based on sslmode and optional CA certificate.
 * If a CA certificate is provided, uses strict verification.
 */
function getTlsOptions(sslMode: string, caCertificate?: string | null): TlsOptions | undefined {
  switch (sslMode) {
    case 'disable':
      return { enabled: false, enforce: false };
    
    case 'prefer':
    case 'require':
      if (caCertificate) {
        // User provided a CA certificate - use strict verification
        console.log('[manage-database] Using user-provided CA certificate for TLS verification');
        return { 
          enabled: true, 
          enforce: true, 
          caCertificates: [caCertificate] 
        };
      } else {
        // No certificate - try TLS without strict verification
        return { enabled: true, enforce: false };
      }
    
    default:
      return { enabled: true, enforce: false };
  }
}

/**
 * Create a postgres Client with proper TLS configuration.
 * Uses user-provided CA certificate if available for verification.
 */
function createDbClient(connectionString: string, caCertificate?: string | null): Client {
  const sslMode = extractSslMode(connectionString);
  const url = new URL(connectionString.replace(/^postgres:\/\//, 'postgresql://'));
  const hostname = url.hostname;
  
  const tlsOptions = getTlsOptions(sslMode, caCertificate);
  console.log(`[manage-database] Creating client for ${hostname} with sslmode=${sslMode}, tls=${JSON.stringify({ ...tlsOptions, caCertificates: tlsOptions?.caCertificates ? '[provided]' : undefined })}`);
  
  return new Client({
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    hostname: hostname,
    port: url.port ? parseInt(url.port) : 5432,
    database: url.pathname.slice(1) || 'postgres',
    tls: tlsOptions,
  });
}

// Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Decrypt using AES-GCM
async function decrypt(ciphertext: string): Promise<string> {
  if (!ENCRYPTION_KEY) {
    throw new Error('SECRETS_ENCRYPTION_KEY not configured');
  }
  
  const [ivHex, encryptedHex] = ciphertext.split(':');
  if (!ivHex || !encryptedHex) {
    throw new Error('Invalid ciphertext format');
  }
  
  const keyBytes = hexToBytes(ENCRYPTION_KEY);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  const iv = hexToBytes(ivHex);
  const encrypted = hexToBytes(encryptedHex);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    encrypted.buffer as ArrayBuffer
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// Check if a value appears to be encrypted (iv:ciphertext format)
function isEncrypted(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  // Plaintext connection strings start with postgresql:// or postgres://
  if (value.startsWith('postgresql://') || value.startsWith('postgres://')) {
    return false;
  }
  // Check for hex:hex format (IV is 12 bytes = 24 hex chars)
  const parts = value.split(':');
  if (parts.length >= 2 && parts[0].length === 24 && /^[0-9a-f]+$/i.test(parts[0])) {
    return true;
  }
  return false;
}

// ============== End Encryption/Decryption Helpers ==============

// ============== BigInt Serialization Helper ==============

/**
 * Recursively convert BigInt values to Numbers (or Strings for very large values).
 * This is needed because JSON.stringify cannot serialize BigInt natively.
 * PostgreSQL BIGINT/BIGSERIAL columns return JavaScript BigInt values.
 */
function serializeBigInts(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'bigint') {
    // Convert to Number if within safe integer range, otherwise String
    if (obj >= Number.MIN_SAFE_INTEGER && obj <= Number.MAX_SAFE_INTEGER) {
      return Number(obj);
    }
    return obj.toString();
  }
  
  // Handle Date objects
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  
  // Handle Buffer/Uint8Array
  if (obj instanceof Uint8Array) {
    return Array.from(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(serializeBigInts);
  }
  
  if (typeof obj === 'object') {
    // Handle objects with toJSON method (like some postgres types)
    if ('toJSON' in obj && typeof (obj as any).toJSON === 'function') {
      return (obj as any).toJSON();
    }
    
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      try {
        result[key] = serializeBigInts(value);
      } catch (e) {
        // If serialization fails, convert to string
        result[key] = String(value);
      }
    }
    return result;
  }
  
  return obj;
}

// ============== End BigInt Serialization Helper ==============

interface ManageDatabaseRequest {
  action: 'get_schema' | 'execute_sql' | 'execute_sql_batch' | 'get_table_data' | 'get_table_columns' | 'export_table' 
    | 'get_table_definition' | 'get_view_definition' | 'get_function_definition' 
    | 'get_trigger_definition' | 'get_index_definition' | 'get_sequence_info' | 'get_type_definition'
    | 'get_table_structure' | 'test_connection';
  // For execute_sql_batch
  statements?: { sql: string; description: string }[];
  wrapInTransaction?: boolean;
  // Either databaseId (Render) OR connectionId (external) must be provided
  databaseId?: string;
  connectionId?: string;
  // Direct connection string for testing before saving
  connectionString?: string;
  // Direct CA certificate for testing before saving
  caCertificate?: string;
  // URL to fetch CA certificate from (e.g., AWS RDS bundle URL)
  caCertificateUrl?: string;
  shareToken?: string;
  // For execute_sql
  sql?: string;
  // For get_table_data and definitions
  schema?: string;
  table?: string;
  name?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
  // For export_table
  format?: 'json' | 'csv' | 'sql';
}

/**
 * Fetch CA certificate from a URL (e.g., AWS RDS bundle).
 * Validates that the response is a valid PEM certificate.
 */
async function fetchCaCertificate(url: string): Promise<string> {
  console.log(`[manage-database] Fetching CA certificate from: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch CA certificate: ${response.status} ${response.statusText}`);
  }
  const content = await response.text();
  if (!content.includes('-----BEGIN CERTIFICATE-----')) {
    throw new Error('Invalid PEM certificate format: missing BEGIN CERTIFICATE header');
  }
  console.log(`[manage-database] Successfully fetched CA certificate (${content.length} bytes)`);
  return content;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RENDER_API_KEY = Deno.env.get("RENDER_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    const body: ManageDatabaseRequest = await req.json();
    const { action, databaseId, connectionId, shareToken } = body;

    console.log(`[manage-database] Action: ${action}, Database ID: ${databaseId}, Connection ID: ${connectionId}`);

    // Handle test_connection with direct connection string
    if (action === 'test_connection' && body.connectionString) {
      console.log("[manage-database] Testing direct connection string");
      try {
        // Ensure password is properly URL-encoded
        const safeConnectionString = ensurePasswordEncoded(body.connectionString);
        console.log("[manage-database] Connection string password encoded for testing");
        
        // Resolve CA certificate: use provided content, or fetch from URL
        let caCert: string | undefined = body.caCertificate;
        if (!caCert && body.caCertificateUrl) {
          caCert = await fetchCaCertificate(body.caCertificateUrl);
        }
        
        const client = createDbClient(safeConnectionString, caCert);
        await client.connect();
        await client.queryObject("SELECT 1");
        await client.end();
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("[manage-database] Connection test failed:", errorMessage);
        return new Response(JSON.stringify({ success: false, error: errorMessage }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let connectionString: string;
    let caCertificate: string | null = null;
    let projectId: string;
    let role: string;

    // Determine connection source: Render database OR external connection
    if (connectionId) {
      // External database connection - owner only
      console.log("[manage-database] Using external connection");
      
      // Get connection string AND CA certificate via secure RPC
      const { data: secrets, error: connError } = await supabase.rpc("get_db_connection_secrets_with_token", {
        p_connection_id: connectionId,
        p_token: shareToken || null,
      });

      if (connError || !secrets || secrets.length === 0) {
        console.error("[manage-database] Connection secrets fetch error:", connError);
        throw new Error(connError?.message || "Connection not found or access denied");
      }

      const secretsRecord = secrets[0];
      const connString = secretsRecord.connection_string;
      caCertificate = secretsRecord.ca_certificate || null;

      // Decrypt connection string if it's encrypted
      if (isEncrypted(connString)) {
        try {
          connectionString = await decrypt(connString);
          // Ensure password is properly URL-encoded after decryption
          connectionString = ensurePasswordEncoded(connectionString);
          console.log("[manage-database] Successfully decrypted and encoded connection string");
        } catch (decryptError) {
          console.error("[manage-database] Failed to decrypt connection string:", decryptError);
          throw new Error("Failed to decrypt connection string. Ensure SECRETS_ENCRYPTION_KEY is configured.");
        }
      } else {
        // Legacy plaintext connection string - also encode password
        console.log("[manage-database] Using plaintext connection string (legacy)");
        connectionString = ensurePasswordEncoded(connString);
      }

      // Get connection details for project_id
      const { data: connDetails, error: detailsError } = await supabase.rpc("get_db_connection_with_token", {
        p_connection_id: connectionId,
        p_token: shareToken || null,
      });

      if (detailsError || !connDetails || connDetails.length === 0) {
        throw new Error("Connection details not found");
      }

      projectId = connDetails[0].project_id;
      role = 'owner'; // Only owners can access external connections

      // Handle test_connection action
      if (action === 'test_connection') {
        try {
          const client = createDbClient(connectionString, caCertificate);
          await client.connect();
          await client.queryObject("SELECT 1");
          await client.end();

          // Update connection status
          await supabase.rpc("update_db_connection_status_with_token", {
            p_connection_id: connectionId,
            p_token: shareToken || null,
            p_status: "connected",
            p_last_error: null,
          });

          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // Update connection status
          await supabase.rpc("update_db_connection_status_with_token", {
            p_connection_id: connectionId,
            p_token: shareToken || null,
            p_status: "failed",
            p_last_error: errorMessage,
          });

          return new Response(JSON.stringify({ success: false, error: errorMessage }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

    } else if (databaseId) {
      // Render database - existing flow
      if (!RENDER_API_KEY) {
        throw new Error("RENDER_API_KEY must be configured");
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

      projectId = database.project_id;

      // Get role for permission checking
      const { data: roleData, error: roleError } = await supabase.rpc("authorize_project_access", {
        p_project_id: database.project_id,
        p_token: shareToken || null,
      });

      if (roleError) {
        throw new Error("Access denied");
      }
      role = roleData;

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
      connectionString = connInfo.externalConnectionString;

      if (!connectionString) {
        throw new Error("No external connection string available");
      }
    } else {
      throw new Error("Either databaseId or connectionId is required");
    }

    let result: any;

    switch (action) {
      case 'get_schema':
        result = await getSchema(connectionString, caCertificate);
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
          /^\s*DELETE\s+FROM\s+.*(?!WHERE)/i,
          /^\s*ALTER\s+TABLE\s+.*\s+DROP\s+/i,
        ];
        
        const isDestructive = destructivePatterns.some(pattern => pattern.test(sqlQuery));
        if (isDestructive && role !== 'owner') {
          throw new Error("Destructive queries (DROP, TRUNCATE, DELETE without WHERE) require owner role");
        }
        
        result = await executeSql(connectionString, sqlQuery, caCertificate);
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
          body.orderDir,
          caCertificate
        );
        break;
      case 'get_table_columns':
        if (!body.schema || !body.table) {
          throw new Error("Schema and table are required");
        }
        result = await getTableColumns(connectionString, body.schema, body.table, caCertificate);
        break;
      case 'export_table':
        if (!body.schema || !body.table) {
          throw new Error("Schema and table are required");
        }
        result = await exportTable(
          connectionString,
          body.schema,
          body.table,
          body.format || 'json',
          caCertificate
        );
        break;
      case 'get_table_definition':
        if (!body.schema || !body.table) {
          throw new Error("Schema and table are required");
        }
        result = await getTableDefinition(connectionString, body.schema, body.table, caCertificate);
        break;
      case 'get_view_definition':
        if (!body.schema || !body.name) {
          throw new Error("Schema and view name are required");
        }
        result = await getViewDefinition(connectionString, body.schema, body.name, caCertificate);
        break;
      case 'get_function_definition':
        if (!body.schema || !body.name) {
          throw new Error("Schema and function name are required");
        }
        result = await getFunctionDefinition(connectionString, body.schema, body.name, caCertificate);
        break;
      case 'get_trigger_definition':
        if (!body.schema || !body.name) {
          throw new Error("Schema and trigger name are required");
        }
        result = await getTriggerDefinition(connectionString, body.schema, body.name, caCertificate);
        break;
      case 'get_index_definition':
        if (!body.schema || !body.name) {
          throw new Error("Schema and index name are required");
        }
        result = await getIndexDefinition(connectionString, body.schema, body.name, caCertificate);
        break;
      case 'get_sequence_info':
        if (!body.schema || !body.name) {
          throw new Error("Schema and sequence name are required");
        }
        result = await getSequenceInfo(connectionString, body.schema, body.name, caCertificate);
        break;
      case 'get_type_definition':
        if (!body.schema || !body.name) {
          throw new Error("Schema and type name are required");
        }
        result = await getTypeDefinition(connectionString, body.schema, body.name, caCertificate);
        break;
      case 'get_table_structure':
        if (!body.schema || !body.table) {
          throw new Error("Schema and table are required");
        }
        result = await getTableStructure(connectionString, body.schema, body.table, caCertificate);
        break;
      case 'execute_sql_batch':
        // Require editor role for SQL batch execution
        if (role !== 'owner' && role !== 'editor') {
          throw new Error("Editor or owner role required for SQL batch execution");
        }
        if (!body.statements || !Array.isArray(body.statements) || body.statements.length === 0) {
          throw new Error("statements array is required for batch execution");
        }
        console.log(`[manage-database] Executing batch of ${body.statements.length} statements, transaction=${body.wrapInTransaction !== false}`);
        const batchResult = await executeSqlBatch(
          connectionString, 
          body.statements, 
          body.wrapInTransaction !== false,
          caCertificate
        );
        // Return batch result directly - it already has success field
        // If batch failed, return 400 status so client knows it failed
        if (!batchResult.success) {
          console.error(`[manage-database] Batch execution failed at statement ${batchResult.failedIndex}: ${batchResult.error}`);
          return new Response(JSON.stringify(serializeBigInts(batchResult)), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Success - return with 200
        return new Response(JSON.stringify(serializeBigInts(batchResult)), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      case 'test_connection':
        // Already handled above for connectionId
        throw new Error("test_connection requires connectionId or connectionString");
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ success: true, data: serializeBigInts(result) }), {
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

async function getSchema(connectionString: string, caCertificate?: string | null) {
  const client = createDbClient(connectionString, caCertificate);
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

/**
 * Execute multiple SQL statements in a single connection with proper transaction handling.
 * This ensures that CREATE TABLE, ALTER, and INSERT statements are all rolled back together
 * if any statement fails.
 */
async function executeSqlBatch(
  connectionString: string, 
  statements: { sql: string; description: string }[],
  wrapInTransaction: boolean = true,
  caCertificate?: string | null
) {
  const client = createDbClient(connectionString, caCertificate);
  await client.connect();
  
  const results: {
    index: number;
    success: boolean;
    description: string;
    sql: string;
    rowCount?: number;
    executionTime: number;
    error?: string;
  }[] = [];
  
  let hasError = false;
  let errorMessage = '';
  let errorIndex = -1;

  try {
    if (wrapInTransaction) {
      console.log("[manage-database] Starting transaction for batch execution");
      await client.queryArray("BEGIN");
    }
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const startTime = Date.now();
      
      try {
        console.log(`[manage-database] Executing statement ${i + 1}/${statements.length}: ${stmt.description}`);
        const result = await client.queryArray(stmt.sql);
        results.push({
          index: i,
          success: true,
          description: stmt.description,
          sql: stmt.sql,
          rowCount: result.rowCount ?? result.rows.length,
          executionTime: Date.now() - startTime
        });
      } catch (stmtError: unknown) {
        const stmtErrorMsg = stmtError instanceof Error ? stmtError.message : String(stmtError);
        console.error(`[manage-database] Statement ${i + 1} failed: ${stmtErrorMsg}`);
        
        results.push({
          index: i,
          success: false,
          description: stmt.description,
          sql: stmt.sql,
          executionTime: Date.now() - startTime,
          error: stmtErrorMsg
        });
        
        hasError = true;
        errorMessage = stmtErrorMsg;
        errorIndex = i;
        break; // Stop on first error
      }
    }
    
    if (wrapInTransaction) {
      if (hasError) {
        console.log("[manage-database] Rolling back transaction due to error");
        await client.queryArray("ROLLBACK");
      } else {
        console.log("[manage-database] Committing transaction");
        await client.queryArray("COMMIT");
      }
    }
    
    // Flatten error info for easier client parsing
    return {
      success: !hasError,
      results,
      completedCount: results.filter(r => r.success).length,
      totalCount: statements.length,
      // Top-level error message for easy extraction
      error: hasError ? errorMessage : undefined,
      failedIndex: hasError ? errorIndex : undefined,
      failedStatement: hasError ? statements[errorIndex]?.description : undefined
    };
    
  } catch (error: unknown) {
    // Connection-level error
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[manage-database] Batch execution connection error:", errorMsg);
    
    if (wrapInTransaction) {
      try {
        await client.queryArray("ROLLBACK");
      } catch { /* ignore rollback errors */ }
    }
    
    throw new Error(`Batch execution failed: ${errorMsg}`);
  } finally {
    await client.end();
  }
}

async function executeSql(connectionString: string, sql: string, caCertificate?: string | null) {
  const client = createDbClient(connectionString, caCertificate);
  await client.connect();

  try {
    const startTime = Date.now();
    
    // Use queryArray instead of queryObject to avoid driver validation issues
    // queryArray is more reliable for arbitrary SQL including complex SELECTs
    const result = await client.queryArray(sql);
    const executionTime = Date.now() - startTime;
    
    // Extract column names from rowDescription
    const columns: string[] = [];
    if (result.rowDescription?.columns) {
      for (const col of result.rowDescription.columns) {
        columns.push(col.name);
      }
    }
    
    // Convert array rows to objects, handling BigInt conversion
    const rows = result.rows.map((row) => {
      if (Array.isArray(row) && columns.length > 0) {
        const obj: Record<string, unknown> = {};
        for (let i = 0; i < columns.length; i++) {
          let value = row[i];
          // Convert BigInt to Number for JSON serialization
          if (typeof value === 'bigint') {
            value = Number(value);
          }
          obj[columns[i]] = value;
        }
        return obj;
      }
      return row;
    });
    
    return {
      rows,
      rowCount: result.rowCount ?? rows.length,
      columns,
      executionTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[manage-database] executeSql error: ${errorMsg}`);
    throw error;
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
  orderDir?: 'asc' | 'desc',
  caCertificate?: string | null
) {
  const client = createDbClient(connectionString, caCertificate);
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

async function getTableColumns(connectionString: string, schema: string, table: string, caCertificate?: string | null) {
  const client = createDbClient(connectionString, caCertificate);
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
  format: 'json' | 'csv' | 'sql',
  caCertificate?: string | null
) {
  const client = createDbClient(connectionString, caCertificate);
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

async function getTableDefinition(connectionString: string, schema: string, table: string, caCertificate?: string | null) {
  const client = createDbClient(connectionString, caCertificate);
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

async function getViewDefinition(connectionString: string, schema: string, viewName: string, caCertificate?: string | null) {
  const client = createDbClient(connectionString, caCertificate);
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

async function getFunctionDefinition(connectionString: string, schema: string, funcName: string, caCertificate?: string | null) {
  const client = createDbClient(connectionString, caCertificate);
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

async function getTriggerDefinition(connectionString: string, schema: string, triggerName: string, caCertificate?: string | null) {
  const client = createDbClient(connectionString, caCertificate);
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

async function getIndexDefinition(connectionString: string, schema: string, indexName: string, caCertificate?: string | null) {
  const client = createDbClient(connectionString, caCertificate);
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

async function getSequenceInfo(connectionString: string, schema: string, seqName: string, caCertificate?: string | null) {
  const client = createDbClient(connectionString, caCertificate);
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

async function getTypeDefinition(connectionString: string, schema: string, typeName: string, caCertificate?: string | null) {
  const client = createDbClient(connectionString, caCertificate);
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

async function getTableStructure(connectionString: string, schema: string, table: string, caCertificate?: string | null) {
  const client = createDbClient(connectionString, caCertificate);
  await client.connect();

  try {
    // Get columns with full details
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

    // Get foreign key columns with references
    const fkResult = await client.queryObject<{
      column_name: string;
      foreign_table_schema: string;
      foreign_table_name: string;
      foreign_column_name: string;
    }>`
      SELECT 
        kcu.column_name,
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu 
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = ${schema}
        AND tc.table_name = ${table}
    `;
    const fkMap = new Map(fkResult.rows.map(r => [
      r.column_name, 
      `${r.foreign_table_schema}.${r.foreign_table_name}(${r.foreign_column_name})`
    ]));

    // Get indexes for this table
    const indexesResult = await client.queryObject<{ indexname: string; indexdef: string }>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = ${schema} AND tablename = ${table}
      ORDER BY indexname
    `;

    // Build columns array with full details
    const columns = columnsResult.rows.map(col => ({
      name: col.column_name,
      type: col.data_type,
      nullable: col.is_nullable === 'YES',
      default: col.column_default,
      maxLength: col.character_maximum_length ? Number(col.character_maximum_length) : null,
      isPrimaryKey: pkColumns.has(col.column_name),
      isForeignKey: fkMap.has(col.column_name),
      foreignKeyRef: fkMap.get(col.column_name) || null,
    }));

    // Build indexes array
    const indexes = indexesResult.rows.map(idx => ({
      name: idx.indexname,
      definition: idx.indexdef + ';',
    }));

    // Build CREATE TABLE statement
    const columnDefs = columnsResult.rows.map(col => {
      let def = `  "${col.column_name}" ${col.data_type}`;
      if (col.character_maximum_length) {
        def += `(${Number(col.character_maximum_length)})`;
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

    const definition = `CREATE TABLE "${schema}"."${table}" (\n${columnDefs.join(',\n')}\n);`;

    return {
      definition,
      columns,
      indexes,
    };
  } finally {
    await client.end();
  }
}
