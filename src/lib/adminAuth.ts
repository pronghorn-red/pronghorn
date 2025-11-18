import { supabase } from "@/integrations/supabase/client";

/**
 * Validates admin token with the server on every admin operation
 * This ensures the key is verified server-side, not just stored client-side
 */
export async function validateAdminToken(token: string | null): Promise<boolean> {
  if (!token) return false;

  try {
    const { data, error } = await supabase.functions.invoke("verify-admin", {
      body: { key: token },
    });

    if (error) {
      console.error("Admin validation error:", error);
      return false;
    }

    return data?.valid === true;
  } catch (error) {
    console.error("Admin validation error:", error);
    return false;
  }
}
