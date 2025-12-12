import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RENDER_API_URL = "https://api.render.com/v1";

interface RenderDatabaseRequest {
  action: 'create' | 'status' | 'update' | 'delete' | 'suspend' | 'resume' | 'restart' | 'connectionInfo';
  databaseId: string;
  shareToken?: string;
  plan?: string;
  version?: string;
  region?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RENDER_API_KEY = Deno.env.get("RENDER_API_KEY");
    const RENDER_OWNER_ID = Deno.env.get("RENDER_OWNER_ID");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!RENDER_API_KEY || !RENDER_OWNER_ID) {
      throw new Error("RENDER_API_KEY and RENDER_OWNER_ID must be configured");
    }

    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    const body: RenderDatabaseRequest = await req.json();
    const { action, databaseId, shareToken } = body;

    console.log(`[render-database] Action: ${action}, Database ID: ${databaseId}`);

    if (!databaseId) {
      throw new Error("databaseId is required");
    }

    // Fetch database record and validate access
    const { data: database, error: dbError } = await supabase.rpc("get_database_with_token", {
      p_database_id: databaseId,
      p_token: shareToken || null,
    });

    if (dbError || !database) {
      console.error("[render-database] Database fetch error:", dbError);
      throw new Error(dbError?.message || "Database not found or access denied");
    }

    const headers = {
      "Authorization": `Bearer ${RENDER_API_KEY}`,
      "Content-Type": "application/json",
    };

    let result: any;

    switch (action) {
      case 'create':
        result = await createRenderDatabase(database, body, headers, RENDER_OWNER_ID, supabase, shareToken);
        break;
      case 'status':
        result = await getStatusRenderDatabase(database, headers, supabase, shareToken);
        break;
      case 'update':
        result = await updateRenderDatabase(database, body, headers, supabase, shareToken);
        break;
      case 'delete':
        result = await deleteRenderDatabase(database, headers, supabase, shareToken);
        break;
      case 'suspend':
        result = await suspendRenderDatabase(database, headers, supabase, shareToken);
        break;
      case 'resume':
        result = await resumeRenderDatabase(database, headers, supabase, shareToken);
        break;
      case 'restart':
        result = await restartRenderDatabase(database, headers);
        break;
      case 'connectionInfo':
        result = await getConnectionInfo(database, headers);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[render-database] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function createRenderDatabase(
  database: any,
  body: RenderDatabaseRequest,
  headers: Record<string, string>,
  ownerId: string,
  supabase: any,
  shareToken?: string
) {
  if (database.render_postgres_id) {
    throw new Error("Database already created on Render");
  }

  const createPayload = {
    name: database.name,
    owner: { id: ownerId },
    databaseName: database.name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
    databaseUser: `user_${database.id.substring(0, 8)}`,
    plan: database.plan,
    version: database.postgres_version || "16",
    region: database.region || "oregon",
  };

  console.log("[render-database] Creating Render Postgres:", JSON.stringify(createPayload));

  const response = await fetch(`${RENDER_API_URL}/postgres`, {
    method: "POST",
    headers,
    body: JSON.stringify(createPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[render-database] Create failed:", errorText);
    throw new Error(`Failed to create database: ${errorText}`);
  }

  const renderData = await response.json();
  console.log("[render-database] Created:", JSON.stringify(renderData));

  // Update our database record with Render IDs
  const { error: updateError } = await supabase.rpc("update_database_with_token", {
    p_database_id: database.id,
    p_token: shareToken || null,
    p_render_postgres_id: renderData.id,
    p_dashboard_url: renderData.dashboard || `https://dashboard.render.com/d/${renderData.id}`,
    p_status: "creating",
    p_has_connection_info: true,
  });

  if (updateError) {
    console.error("[render-database] Failed to update DB record:", updateError);
  }

  return renderData;
}

async function getStatusRenderDatabase(
  database: any,
  headers: Record<string, string>,
  supabase: any,
  shareToken?: string
) {
  if (!database.render_postgres_id) {
    throw new Error("Database not yet created on Render");
  }

  const response = await fetch(`${RENDER_API_URL}/postgres/${database.render_postgres_id}`, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get database status: ${errorText}`);
  }

  const renderData = await response.json();
  
  // Map Render status to our status
  let status: string = database.status;
  if (renderData.status === "available") {
    status = "available";
  } else if (renderData.status === "creating") {
    status = "creating";
  } else if (renderData.suspended) {
    status = "suspended";
  }

  // Update our status
  if (status !== database.status) {
    await supabase.rpc("update_database_with_token", {
      p_database_id: database.id,
      p_token: shareToken || null,
      p_status: status,
    });
  }

  return { ...renderData, localStatus: status };
}

async function updateRenderDatabase(
  database: any,
  body: RenderDatabaseRequest,
  headers: Record<string, string>,
  supabase: any,
  shareToken?: string
) {
  if (!database.render_postgres_id) {
    throw new Error("Database not yet created on Render");
  }

  const updatePayload: any = {};
  if (body.plan) updatePayload.plan = body.plan;

  const response = await fetch(`${RENDER_API_URL}/postgres/${database.render_postgres_id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(updatePayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update database: ${errorText}`);
  }

  const renderData = await response.json();

  // Update local record
  if (body.plan) {
    await supabase.rpc("update_database_with_token", {
      p_database_id: database.id,
      p_token: shareToken || null,
      p_plan: body.plan,
      p_status: "updating",
    });
  }

  return renderData;
}

async function deleteRenderDatabase(
  database: any,
  headers: Record<string, string>,
  supabase: any,
  shareToken?: string
) {
  if (database.render_postgres_id) {
    const response = await fetch(`${RENDER_API_URL}/postgres/${database.render_postgres_id}`, {
      method: "DELETE",
      headers,
    });

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      throw new Error(`Failed to delete database on Render: ${errorText}`);
    }
  }

  // Delete local record
  await supabase.rpc("delete_database_with_token", {
    p_database_id: database.id,
    p_token: shareToken || null,
  });

  return { deleted: true };
}

async function suspendRenderDatabase(
  database: any,
  headers: Record<string, string>,
  supabase: any,
  shareToken?: string
) {
  if (!database.render_postgres_id) {
    throw new Error("Database not yet created on Render");
  }

  const response = await fetch(`${RENDER_API_URL}/postgres/${database.render_postgres_id}/suspend`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to suspend database: ${errorText}`);
  }

  // Update local status
  await supabase.rpc("update_database_with_token", {
    p_database_id: database.id,
    p_token: shareToken || null,
    p_status: "suspended",
  });

  return { suspended: true };
}

async function resumeRenderDatabase(
  database: any,
  headers: Record<string, string>,
  supabase: any,
  shareToken?: string
) {
  if (!database.render_postgres_id) {
    throw new Error("Database not yet created on Render");
  }

  const response = await fetch(`${RENDER_API_URL}/postgres/${database.render_postgres_id}/resume`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to resume database: ${errorText}`);
  }

  // Update local status
  await supabase.rpc("update_database_with_token", {
    p_database_id: database.id,
    p_token: shareToken || null,
    p_status: "available",
  });

  return { resumed: true };
}

async function restartRenderDatabase(
  database: any,
  headers: Record<string, string>
) {
  if (!database.render_postgres_id) {
    throw new Error("Database not yet created on Render");
  }

  const response = await fetch(`${RENDER_API_URL}/postgres/${database.render_postgres_id}/restart`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to restart database: ${errorText}`);
  }

  return { restarted: true };
}

async function getConnectionInfo(
  database: any,
  headers: Record<string, string>
) {
  if (!database.render_postgres_id) {
    throw new Error("Database not yet created on Render");
  }

  const response = await fetch(`${RENDER_API_URL}/postgres/${database.render_postgres_id}/connection-info`, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get connection info: ${errorText}`);
  }

  return await response.json();
}
