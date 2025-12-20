import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-project-id, x-share-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = "https://obkzdksfayygnrzdqoam.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ia3pka3NmYXl5Z25yemRxb2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MTA4MzcsImV4cCI6MjA3ODk4NjgzN30.xOKphCiEilzPTo9EGHNJqAJfruM_bijI9PN3BQBF-z8";

const MAX_PAYLOAD_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_ITEMS = 100;
const MAX_SINGLE_ITEM_SIZE = 10 * 1024 * 1024; // 10MB

interface IngestItem {
  type: "text" | "image" | "binary";
  content: string; // text content or base64 encoded binary
  fileName?: string;
  contentType?: string;
  title?: string;
}

interface IngestPayload {
  projectId?: string;
  token?: string;
  items: IngestItem[];
}

interface ArtifactResult {
  success: boolean;
  artifactId?: string;
  imageUrl?: string;
  error?: string;
  index: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log(`[ingest-artifacts] ${req.method} request received`);

  try {
    // Check content length
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_SIZE) {
      console.error(`[ingest-artifacts] Payload too large: ${contentLength} bytes`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Payload exceeds maximum size of 50MB" 
        }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let projectId: string | null = null;
    let token: string | null = null;
    let items: IngestItem[] = [];

    // Extract projectId and token from headers first
    projectId = req.headers.get("x-project-id");
    token = req.headers.get("x-share-token");

    if (req.method === "GET") {
      // Handle GET request - single text item via query params
      const url = new URL(req.url);
      projectId = projectId || url.searchParams.get("projectId");
      token = token || url.searchParams.get("token");
      const content = url.searchParams.get("content");
      const title = url.searchParams.get("title");

      if (content) {
        items = [{ type: "text", content, title: title || undefined }];
      }
    } else if (req.method === "POST") {
      // Handle POST request - multi-item payload
      const body = await req.json() as IngestPayload;
      
      // Override with body values if not in headers
      projectId = projectId || body.projectId || null;
      token = token || body.token || null;
      items = body.items || [];
    } else {
      return new Response(
        JSON.stringify({ success: false, error: "Method not allowed. Use GET or POST." }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate required fields
    if (!projectId) {
      console.error("[ingest-artifacts] Missing projectId");
      return new Response(
        JSON.stringify({ success: false, error: "Missing projectId. Provide via X-Project-Id header or in body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!token) {
      console.error("[ingest-artifacts] Missing token");
      return new Response(
        JSON.stringify({ success: false, error: "Missing token. Provide via X-Share-Token header or in body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!items || items.length === 0) {
      console.error("[ingest-artifacts] No items provided");
      return new Response(
        JSON.stringify({ success: false, error: "No items provided in payload." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (items.length > MAX_ITEMS) {
      console.error(`[ingest-artifacts] Too many items: ${items.length}`);
      return new Response(
        JSON.stringify({ success: false, error: `Too many items. Maximum is ${MAX_ITEMS} per request.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ingest-artifacts] Processing ${items.length} items for project ${projectId}`);

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Validate access - require editor role
    const { data: roleData, error: roleError } = await supabase.rpc("require_role", {
      p_project_id: projectId,
      p_token: token,
      p_min_role: "editor"
    });

    if (roleError) {
      console.error("[ingest-artifacts] Access denied:", roleError.message);
      return new Response(
        JSON.stringify({ success: false, error: "Access denied. Invalid project ID or token, or insufficient permissions." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ingest-artifacts] Access validated with role: ${roleData}`);

    // Process each item
    const results: ArtifactResult[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      try {
        // Validate item
        if (!item.type || !item.content) {
          results.push({ success: false, error: "Missing type or content", index: i });
          continue;
        }

        // Check single item size (approximate for base64)
        const itemSize = item.content.length;
        if (itemSize > MAX_SINGLE_ITEM_SIZE * 1.4) { // base64 is ~1.37x larger
          results.push({ success: false, error: "Item exceeds 10MB limit", index: i });
          continue;
        }

        let imageUrl: string | null = null;
        let artifactContent = item.content;

        // Handle binary/image uploads
        if (item.type === "image" || item.type === "binary") {
          // Decode base64
          const binaryData = Uint8Array.from(atob(item.content), c => c.charCodeAt(0));
          
          // Generate unique filename
          const timestamp = Date.now();
          const randomId = crypto.randomUUID().split("-")[0];
          const extension = getExtensionFromContentType(item.contentType || "application/octet-stream");
          const fileName = item.fileName || `webhook-${timestamp}-${randomId}.${extension}`;
          const storagePath = `${projectId}/${fileName}`;

          // Upload to storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("artifact-images")
            .upload(storagePath, binaryData, {
              contentType: item.contentType || "application/octet-stream",
              upsert: true
            });

          if (uploadError) {
            console.error(`[ingest-artifacts] Upload error for item ${i}:`, uploadError.message);
            results.push({ success: false, error: `Upload failed: ${uploadError.message}`, index: i });
            continue;
          }

          // Get public URL
          const { data: urlData } = supabase.storage
            .from("artifact-images")
            .getPublicUrl(storagePath);

          imageUrl = urlData.publicUrl;
          
          // For image artifacts, content will reference the image
          if (item.type === "image") {
            artifactContent = item.title || `Image: ${fileName}`;
          }
        }

        // Create artifact via RPC
        const { data: artifactData, error: artifactError } = await supabase.rpc("insert_artifact_with_token", {
          p_project_id: projectId,
          p_token: token,
          p_content: artifactContent,
          p_ai_title: item.title || `Webhook Import ${new Date().toISOString()}`,
          p_image_url: imageUrl
        });

        if (artifactError) {
          console.error(`[ingest-artifacts] Artifact creation error for item ${i}:`, artifactError.message);
          results.push({ success: false, error: `Failed to create artifact: ${artifactError.message}`, index: i });
          continue;
        }

        console.log(`[ingest-artifacts] Created artifact ${artifactData} for item ${i}`);
        results.push({ 
          success: true, 
          artifactId: artifactData, 
          imageUrl: imageUrl || undefined,
          index: i 
        });

      } catch (itemError) {
        console.error(`[ingest-artifacts] Error processing item ${i}:`, itemError);
        results.push({ 
          success: false, 
          error: itemError instanceof Error ? itemError.message : "Unknown error", 
          index: i 
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const elapsed = Date.now() - startTime;

    console.log(`[ingest-artifacts] Completed: ${successCount} success, ${failureCount} failed in ${elapsed}ms`);

    return new Response(
      JSON.stringify({
        success: failureCount === 0,
        message: `Processed ${items.length} items: ${successCount} created, ${failureCount} failed`,
        projectId,
        itemsReceived: items.length,
        itemsCreated: successCount,
        itemsFailed: failureCount,
        results,
        processingTimeMs: elapsed
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[ingest-artifacts] Unexpected error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Internal server error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getExtensionFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/markdown": "md",
    "application/json": "json",
    "application/xml": "xml",
    "text/html": "html",
    "text/css": "css",
    "application/javascript": "js",
    "application/typescript": "ts",
  };
  return map[contentType] || "bin";
}
