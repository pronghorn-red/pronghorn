import { supabase } from "@/integrations/supabase/client";

/**
 * Get decrypted connection string for a database connection
 * Connection strings are encrypted at rest and only decrypted when accessed via this function
 */
export async function getDatabaseConnectionString(
  connectionId: string,
  shareToken: string | null
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("database-connection-secrets", {
    body: {
      action: "get",
      connectionId,
      shareToken,
    },
  });

  if (error) {
    console.error("[databaseConnectionSecrets] Get failed:", error);
    throw new Error(error.message || "Failed to get database connection string");
  }

  return data.connectionString;
}

/**
 * Set encrypted connection string for a database connection
 * Connection strings are encrypted before storage - the raw value never touches the database
 */
export async function setDatabaseConnectionString(
  connectionId: string,
  shareToken: string | null,
  connectionString: string
): Promise<void> {
  const { error } = await supabase.functions.invoke("database-connection-secrets", {
    body: {
      action: "set",
      connectionId,
      shareToken,
      connectionString,
    },
  });

  if (error) {
    console.error("[databaseConnectionSecrets] Set failed:", error);
    throw new Error(error.message || "Failed to set database connection string");
  }
}
