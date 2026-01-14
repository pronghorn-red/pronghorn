import { supabase } from "@/integrations/supabase/client";

export interface DatabaseConnectionSecrets {
  connectionString: string;
  caCertificate: string | null;
}

/**
 * Get decrypted connection string and CA certificate for a database connection
 * Connection strings are encrypted at rest and only decrypted when accessed via this function
 */
export async function getDatabaseConnectionSecrets(
  connectionId: string,
  shareToken: string | null
): Promise<DatabaseConnectionSecrets> {
  const { data, error } = await supabase.functions.invoke("database-connection-secrets", {
    body: {
      action: "get",
      connectionId,
      shareToken,
    },
  });

  if (error) {
    console.error("[databaseConnectionSecrets] Get failed:", error);
    throw new Error(error.message || "Failed to get database connection secrets");
  }

  return {
    connectionString: data.connectionString,
    caCertificate: data.caCertificate || null,
  };
}

/**
 * Get decrypted connection string for a database connection (legacy alias)
 * @deprecated Use getDatabaseConnectionSecrets instead
 */
export async function getDatabaseConnectionString(
  connectionId: string,
  shareToken: string | null
): Promise<string> {
  const secrets = await getDatabaseConnectionSecrets(connectionId, shareToken);
  return secrets.connectionString;
}

/**
 * Set encrypted connection string and optionally CA certificate for a database connection
 * Connection strings are encrypted before storage - the raw value never touches the database
 * 
 * @param connectionId - The ID of the database connection
 * @param shareToken - The share token for access validation
 * @param connectionString - The raw connection string to encrypt and store
 * @param caCertificateUrl - Optional URL to fetch CA certificate from (e.g., AWS RDS bundle)
 * @param caCertificateContent - Optional PEM-encoded CA certificate content (from file upload)
 */
export async function setDatabaseConnectionString(
  connectionId: string,
  shareToken: string | null,
  connectionString: string,
  caCertificateUrl?: string,
  caCertificateContent?: string
): Promise<void> {
  const { error } = await supabase.functions.invoke("database-connection-secrets", {
    body: {
      action: "set",
      connectionId,
      shareToken,
      connectionString,
      caCertificateUrl,
      caCertificateContent,
    },
  });

  if (error) {
    console.error("[databaseConnectionSecrets] Set failed:", error);
    throw new Error(error.message || "Failed to set database connection string");
  }
}
