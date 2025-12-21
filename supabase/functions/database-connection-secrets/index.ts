import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENCRYPTION_KEY = Deno.env.get('SECRETS_ENCRYPTION_KEY');

// Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Convert Uint8Array to hex string
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Encrypt using AES-GCM
async function encrypt(plaintext: string): Promise<string> {
  if (!ENCRYPTION_KEY) {
    throw new Error('SECRETS_ENCRYPTION_KEY not configured');
  }
  
  const keyBytes = hexToBytes(ENCRYPTION_KEY);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    data
  );
  
  // Format: iv:ciphertext (both hex encoded)
  return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(encrypted))}`;
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
  // Encrypted format: 24-char hex IV + ":" + encrypted data
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Get authorization header for user context
    const authHeader = req.headers.get('Authorization');
    
    // Create client with user's auth for RLS
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} }
    });

    const { action, connectionId, shareToken, connectionString } = await req.json();
    
    console.log(`[database-connection-secrets] Action: ${action}, Connection: ${connectionId}`);

    if (!connectionId) {
      return new Response(
        JSON.stringify({ error: 'connectionId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate owner access via RPC - only owners can manage connection secrets
    const { data: connection, error: accessError } = await supabase.rpc(
      'get_db_connection_with_token',
      { p_connection_id: connectionId, p_token: shareToken || null }
    );

    if (accessError) {
      console.error('[database-connection-secrets] Access denied:', accessError.message);
      return new Response(
        JSON.stringify({ error: 'Access denied: ' + accessError.message }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!connection || connection.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Connection not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const connRecord = connection[0];

    if (action === 'get') {
      // Get the encrypted connection string via RPC
      const { data: encryptedConnString, error: getError } = await supabase.rpc(
        'get_db_connection_string_with_token',
        { p_connection_id: connectionId, p_token: shareToken || null }
      );

      if (getError) {
        console.error('[database-connection-secrets] Get connection string failed:', getError.message);
        return new Response(
          JSON.stringify({ error: 'Failed to get connection string: ' + getError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!encryptedConnString) {
        return new Response(
          JSON.stringify({ error: 'No connection string found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if the value is encrypted and decrypt it
      let decryptedConnectionString = encryptedConnString;
      if (isEncrypted(encryptedConnString)) {
        try {
          decryptedConnectionString = await decrypt(encryptedConnString);
          console.log('[database-connection-secrets] Successfully decrypted connection string');
        } catch (e) {
          console.error('[database-connection-secrets] Decryption failed:', e);
          return new Response(
            JSON.stringify({ error: 'Failed to decrypt connection string' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        console.log('[database-connection-secrets] Connection string is plaintext (legacy)');
      }

      return new Response(
        JSON.stringify({ connectionString: decryptedConnectionString }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'set') {
      if (!connectionString) {
        return new Response(
          JSON.stringify({ error: 'connectionString is required for set action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Encrypt the connection string
      const encryptedConnectionString = await encrypt(connectionString);
      console.log('[database-connection-secrets] Encrypted connection string');

      // Update using service role (access already validated above)
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
      
      const { error: updateError } = await serviceClient
        .from('project_database_connections')
        .update({ 
          connection_string: encryptedConnectionString,
          updated_at: new Date().toISOString()
        })
        .eq('id', connectionId);

      if (updateError) {
        console.error('[database-connection-secrets] Update failed:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update: ' + updateError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[database-connection-secrets] Successfully updated encrypted connection string');
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Use "get" or "set"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[database-connection-secrets] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
