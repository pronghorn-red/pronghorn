import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RENDER_API_URL = "https://api.render.com/v1";

interface RenderManagementRequest {
  action:
    | "listServices"
    | "listDatabases"
    | "suspendService"
    | "resumeService"
    | "restartService"
    | "deleteService"
    | "suspendDatabase"
    | "resumeDatabase"
    | "restartDatabase"
    | "deleteDatabase";
  serviceId?: string;
  postgresId?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RENDER_API_KEY = Deno.env.get("RENDER_API_KEY");
    const RENDER_OWNER_ID = Deno.env.get("RENDER_ID");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!RENDER_API_KEY || !RENDER_OWNER_ID) {
      return new Response(
        JSON.stringify({ error: "Render API credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get auth header and verify superadmin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create supabase client with user's auth
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Get user from auth token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify superadmin role
    const { data: isSuperadmin, error: roleError } = await supabase.rpc("is_superadmin", {
      _user_id: user.id,
    });

    if (roleError || !isSuperadmin) {
      console.log("[superadmin-render-management] Access denied for user:", user.id, roleError);
      return new Response(
        JSON.stringify({ error: "Superadmin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: RenderManagementRequest = await req.json();
    const { action, serviceId, postgresId } = body;

    console.log(`[superadmin-render-management] Action: ${action}, User: ${user.id}`);

    const renderHeaders = {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RENDER_API_KEY}`,
    };

    let response: Response;
    let result: any;

    switch (action) {
      case "listServices": {
        // Fetch all services for the owner
        const servicesRes = await fetch(
          `${RENDER_API_URL}/services?ownerId=${RENDER_OWNER_ID}&limit=100`,
          { method: "GET", headers: renderHeaders }
        );
        const servicesData = await servicesRes.json();
        console.log("[superadmin-render-management] Services fetched:", servicesData.length || 0);

        // Enrich with owner info from database
        const enrichedServices = await enrichResourcesWithOwnerInfo(
          supabase,
          servicesData,
          "service"
        );

        return new Response(
          JSON.stringify({ services: enrichedServices }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "listDatabases": {
        // Fetch all PostgreSQL databases for the owner
        const dbRes = await fetch(
          `${RENDER_API_URL}/postgres?ownerId=${RENDER_OWNER_ID}&limit=100`,
          { method: "GET", headers: renderHeaders }
        );
        const dbData = await dbRes.json();
        console.log("[superadmin-render-management] Databases fetched:", dbData.length || 0);

        // Enrich with owner info from database
        const enrichedDatabases = await enrichResourcesWithOwnerInfo(
          supabase,
          dbData,
          "database"
        );

        return new Response(
          JSON.stringify({ databases: enrichedDatabases }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "suspendService": {
        if (!serviceId) {
          return new Response(
            JSON.stringify({ error: "serviceId required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        response = await fetch(`${RENDER_API_URL}/services/${serviceId}/suspend`, {
          method: "POST",
          headers: renderHeaders,
        });
        result = response.ok ? { success: true } : await response.json();
        break;
      }

      case "resumeService": {
        if (!serviceId) {
          return new Response(
            JSON.stringify({ error: "serviceId required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        response = await fetch(`${RENDER_API_URL}/services/${serviceId}/resume`, {
          method: "POST",
          headers: renderHeaders,
        });
        result = response.ok ? { success: true } : await response.json();
        break;
      }

      case "restartService": {
        if (!serviceId) {
          return new Response(
            JSON.stringify({ error: "serviceId required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        response = await fetch(`${RENDER_API_URL}/services/${serviceId}/restart`, {
          method: "POST",
          headers: renderHeaders,
        });
        result = response.ok ? { success: true } : await response.json();
        break;
      }

      case "deleteService": {
        if (!serviceId) {
          return new Response(
            JSON.stringify({ error: "serviceId required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        response = await fetch(`${RENDER_API_URL}/services/${serviceId}`, {
          method: "DELETE",
          headers: renderHeaders,
        });
        
        if (response.ok) {
          // Also delete from our database if exists
          await supabase
            .from("project_deployments")
            .delete()
            .eq("render_service_id", serviceId);
          result = { success: true };
        } else {
          result = await response.json();
        }
        break;
      }

      case "suspendDatabase": {
        if (!postgresId) {
          return new Response(
            JSON.stringify({ error: "postgresId required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        response = await fetch(`${RENDER_API_URL}/postgres/${postgresId}/suspend`, {
          method: "POST",
          headers: renderHeaders,
        });
        result = response.ok ? { success: true } : await response.json();
        break;
      }

      case "resumeDatabase": {
        if (!postgresId) {
          return new Response(
            JSON.stringify({ error: "postgresId required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        response = await fetch(`${RENDER_API_URL}/postgres/${postgresId}/resume`, {
          method: "POST",
          headers: renderHeaders,
        });
        result = response.ok ? { success: true } : await response.json();
        break;
      }

      case "restartDatabase": {
        if (!postgresId) {
          return new Response(
            JSON.stringify({ error: "postgresId required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        response = await fetch(`${RENDER_API_URL}/postgres/${postgresId}/restart`, {
          method: "POST",
          headers: renderHeaders,
        });
        result = response.ok ? { success: true } : await response.json();
        break;
      }

      case "deleteDatabase": {
        if (!postgresId) {
          return new Response(
            JSON.stringify({ error: "postgresId required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        response = await fetch(`${RENDER_API_URL}/postgres/${postgresId}`, {
          method: "DELETE",
          headers: renderHeaders,
        });
        
        if (response.ok) {
          // Also delete from our database if exists
          await supabase
            .from("project_databases")
            .delete()
            .eq("render_postgres_id", postgresId);
          result = { success: true };
        } else {
          result = await response.json();
        }
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { 
        status: response!.ok ? 200 : response!.status, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: any) {
    console.error("[superadmin-render-management] Error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper function to enrich Render resources with owner info from our database
async function enrichResourcesWithOwnerInfo(
  supabase: any,
  resources: any[],
  resourceType: "service" | "database"
): Promise<any[]> {
  if (!Array.isArray(resources) || resources.length === 0) {
    return [];
  }

  const enrichedResources = [];

  for (const resource of resources) {
    const item = resource.service || resource.postgres || resource;
    const renderId = item.id;
    
    let ownerInfo = null;
    let projectInfo = null;
    let resourceCreatedAt = null;

    if (resourceType === "service") {
      // Look up deployment in project_deployments
      const { data: deployment } = await supabase
        .from("project_deployments")
        .select(`
          id,
          created_at,
          project_id,
          projects:project_id (
            id,
            name,
            created_at,
            created_by,
            profiles:created_by (
              email,
              display_name
            )
          )
        `)
        .eq("render_service_id", renderId)
        .maybeSingle();

      if (deployment) {
        resourceCreatedAt = deployment.created_at;
        projectInfo = deployment.projects ? {
          id: deployment.projects.id,
          name: deployment.projects.name,
          created_at: deployment.projects.created_at,
        } : null;
        
        if (deployment.projects?.profiles) {
          const profile = Array.isArray(deployment.projects.profiles) 
            ? deployment.projects.profiles[0] 
            : deployment.projects.profiles;
          ownerInfo = {
            email: profile?.email,
            display_name: profile?.display_name,
          };
        }
      }
    } else {
      // Look up database in project_databases
      const { data: database } = await supabase
        .from("project_databases")
        .select(`
          id,
          created_at,
          project_id,
          projects:project_id (
            id,
            name,
            created_at,
            created_by,
            profiles:created_by (
              email,
              display_name
            )
          )
        `)
        .eq("render_postgres_id", renderId)
        .maybeSingle();

      if (database) {
        resourceCreatedAt = database.created_at;
        projectInfo = database.projects ? {
          id: database.projects.id,
          name: database.projects.name,
          created_at: database.projects.created_at,
        } : null;
        
        if (database.projects?.profiles) {
          const profile = Array.isArray(database.projects.profiles) 
            ? database.projects.profiles[0] 
            : database.projects.profiles;
          ownerInfo = {
            email: profile?.email,
            display_name: profile?.display_name,
          };
        }
      }
    }

    enrichedResources.push({
      ...item,
      ownerInfo,
      projectInfo,
      resourceCreatedAt,
      isOrphaned: !projectInfo,
    });
  }

  return enrichedResources;
}
