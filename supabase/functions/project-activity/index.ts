import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ActivityCount {
  period: string;
  count: number;
}

interface EntityActivity {
  key: string;
  label: string;
  data: ActivityCount[];
}

interface ActivityResponse {
  entities: EntityActivity[];
  periods: string[];
  granularity: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, shareToken, granularity = "week" } = await req.json();

    if (!projectId) {
      return new Response(JSON.stringify({ error: "Project ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate access (viewer+ allowed)
    const { data: role, error: authError } = await supabase.rpc("authorize_project_access", {
      p_project_id: projectId,
      p_token: shareToken || null,
    });

    if (authError || !role) {
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch project creation date
    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select("created_at")
      .eq("id", projectId)
      .single();

    if (projectError || !projectData) {
      console.error("Project fetch error:", projectError);
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const projectCreatedAt = new Date(projectData.created_at);
    console.log("Project created at:", projectCreatedAt.toISOString());

    // Define granularity SQL
    const granularityMap: Record<string, string> = {
      day: "day",
      week: "week",
      month: "month",
    };
    const truncUnit = granularityMap[granularity] || "week";

    // Define all entity tables to count
    const entityTables = [
      { key: "artifacts", label: "Artifacts", table: "artifacts", dateCol: "created_at" },
      { key: "canvas_nodes", label: "Canvas Nodes", table: "canvas_nodes", dateCol: "created_at" },
      { key: "canvas_edges", label: "Canvas Edges", table: "canvas_edges", dateCol: "created_at" },
      { key: "canvas_layers", label: "Canvas Layers", table: "canvas_layers", dateCol: "created_at" },
      { key: "requirements", label: "Requirements", table: "requirements", dateCol: "created_at" },
      { key: "project_standards", label: "Standards Linked", table: "project_standards", dateCol: "created_at" },
      { key: "project_tech_stacks", label: "Tech Stacks Linked", table: "project_tech_stacks", dateCol: "created_at" },
      { key: "project_specifications", label: "Specifications", table: "project_specifications", dateCol: "created_at" },
      { key: "project_repos", label: "Repositories", table: "project_repos", dateCol: "created_at" },
      { key: "repo_files", label: "Repository Files", table: "repo_files", dateCol: "created_at" },
      { key: "repo_commits", label: "Commits", table: "repo_commits", dateCol: "created_at" },
      { key: "chat_sessions", label: "Chat Sessions", table: "chat_sessions", dateCol: "created_at" },
      { key: "agent_sessions", label: "Agent Sessions", table: "agent_sessions", dateCol: "created_at" },
      { key: "project_databases", label: "Databases", table: "project_databases", dateCol: "created_at" },
      { key: "project_database_connections", label: "External Connections", table: "project_database_connections", dateCol: "created_at" },
      { key: "project_deployments", label: "Deployments", table: "project_deployments", dateCol: "created_at" },
    ];

    // Generate periods from project creation to now
    const periods: string[] = [];
    const now = new Date();
    
    // Align start date to period boundary
    const startDate = new Date(projectCreatedAt);
    if (truncUnit === "week") {
      const dayOfWeek = startDate.getDay();
      startDate.setDate(startDate.getDate() - dayOfWeek);
    } else if (truncUnit === "month") {
      startDate.setDate(1);
    }
    startDate.setHours(0, 0, 0, 0);

    // Generate all periods from project creation to now
    const currentDate = new Date(startDate);
    while (currentDate <= now) {
      periods.push(currentDate.toISOString().split("T")[0]);
      if (truncUnit === "day") {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (truncUnit === "week") {
        currentDate.setDate(currentDate.getDate() + 7);
      } else {
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }

    // Query all entity counts in parallel
    const entityPromises = entityTables.map(async (entity) => {
        const query = `
          SELECT 
            date_trunc('${truncUnit}', ${entity.dateCol})::date as period,
            COUNT(*)::int as count
          FROM ${entity.table}
          WHERE project_id = '${projectId}'
            AND ${entity.dateCol} >= '${projectCreatedAt.toISOString()}'
          GROUP BY period
          ORDER BY period
        `;

      const { data, error } = await supabase.rpc("exec_sql", { sql: query }).single();
      
      if (error) {
        // Fallback to direct count if exec_sql doesn't exist
        const { data: countData, error: countError } = await supabase
          .from(entity.table)
          .select("created_at", { count: "exact", head: false })
          .eq("project_id", projectId);

        if (countError) {
          console.error(`Error querying ${entity.table}:`, countError);
          return {
            key: entity.key,
            label: entity.label,
            data: periods.map((p) => ({ period: p, count: 0 })),
          };
        }

        // Group counts by period manually
        const countsByPeriod: Record<string, number> = {};
        periods.forEach((p) => (countsByPeriod[p] = 0));

        (countData || []).forEach((row: any) => {
          const rowDate = new Date(row.created_at);
          let periodKey: string;

          if (truncUnit === "day") {
            periodKey = rowDate.toISOString().split("T")[0];
          } else if (truncUnit === "week") {
            const dayOfWeek = rowDate.getDay();
            rowDate.setDate(rowDate.getDate() - dayOfWeek);
            periodKey = rowDate.toISOString().split("T")[0];
          } else {
            rowDate.setDate(1);
            periodKey = rowDate.toISOString().split("T")[0];
          }

          if (periodKey in countsByPeriod) {
            countsByPeriod[periodKey]++;
          }
        });

        return {
          key: entity.key,
          label: entity.label,
          data: periods.map((p) => ({ period: p, count: countsByPeriod[p] || 0 })),
        };
      }

      // Process results from exec_sql
      const results = Array.isArray(data) ? data : [];
      const countsByPeriod: Record<string, number> = {};
      periods.forEach((p) => (countsByPeriod[p] = 0));
      results.forEach((row: any) => {
        const periodStr = new Date(row.period).toISOString().split("T")[0];
        countsByPeriod[periodStr] = row.count;
      });

      return {
        key: entity.key,
        label: entity.label,
        data: periods.map((p) => ({ period: p, count: countsByPeriod[p] || 0 })),
      };
    });

    const entities = await Promise.all(entityPromises);

    const response: ActivityResponse = {
      entities,
      periods,
      granularity,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in project-activity:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
