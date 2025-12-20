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
      // Return documentation page as rendered HTML
      const htmlContent = getDocumentationHtml();
      return new Response(htmlContent, {
        status: 200,
        headers: new Headers({
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        }),
      });
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
          
          // ALWAYS generate unique filename - never reuse existing files
          const timestamp = Date.now();
          const randomId = crypto.randomUUID().split("-")[0];
          const extension = getExtensionFromContentType(item.contentType || "application/octet-stream");
          
          // Use client fileName as prefix if provided, but always append unique identifiers
          const baseName = item.fileName 
            ? item.fileName.replace(/\.[^/.]+$/, '') // Remove extension from client filename
            : 'webhook';
          const fileName = `${baseName}-${timestamp}-${randomId}.${extension}`;
          const storagePath = `${projectId}/${fileName}`;

          // Upload to storage - use upsert: false since filenames are always unique
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("artifact-images")
            .upload(storagePath, binaryData, {
              contentType: item.contentType || "application/octet-stream",
              upsert: false  // Never update - always create new files
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
        // Note: Title will be added via AI summary later - function only takes content, source_type, source_id, image_url
        const { data: artifactData, error: artifactError } = await supabase.rpc("insert_artifact_with_token", {
          p_project_id: projectId,
          p_token: token,
          p_content: item.title ? `# ${item.title}\n\n${artifactContent}` : artifactContent,
          p_source_type: "webhook",
          p_source_id: null,  // Explicitly pass null to resolve function overload ambiguity
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

function getDocumentationHtml(): string {
  const endpoint = "https://api.pronghorn.red/functions/v1/ingest-artifacts";
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pronghorn Artifact Ingest API</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      margin: 0;
      padding: 2rem;
      line-height: 1.6;
    }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { color: #ff6b6b; margin-bottom: 0.5rem; }
    h2 { color: #ffa94d; margin-top: 2rem; border-bottom: 1px solid #333; padding-bottom: 0.5rem; }
    h3 { color: #69db7c; }
    .subtitle { color: #888; margin-bottom: 2rem; }
    code {
      background: #1a1a1a;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.9em;
    }
    pre {
      background: #1a1a1a;
      padding: 1rem;
      border-radius: 8px;
      overflow-x: auto;
      border: 1px solid #333;
    }
    pre code { background: none; padding: 0; }
    .warning {
      background: #3d2a1a;
      border-left: 4px solid #ffa94d;
      padding: 1rem;
      margin: 1rem 0;
      border-radius: 0 8px 8px 0;
    }
    .info {
      background: #1a2a3d;
      border-left: 4px solid #69db7c;
      padding: 1rem;
      margin: 1rem 0;
      border-radius: 0 8px 8px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
    }
    th, td {
      border: 1px solid #333;
      padding: 0.75rem;
      text-align: left;
    }
    th { background: #1a1a1a; color: #ffa94d; }
    .method { 
      display: inline-block;
      background: #69db7c;
      color: #0a0a0a;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-weight: bold;
    }
    a { color: #69db7c; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🦌 Pronghorn Artifact Ingest API</h1>
    <p class="subtitle">Webhook endpoint to ingest text and images into your Pronghorn projects</p>

    <div class="warning">
      <strong>⚠️ Authentication Required</strong><br>
      You need a valid <code>projectId</code> and <code>token</code> with <strong>editor</strong> or <strong>owner</strong> access to use this endpoint.
    </div>

    <h2>Endpoint</h2>
    <pre><code><span class="method">POST</span> ${endpoint}</code></pre>

    <h2>Authentication</h2>
    <p>Provide credentials via headers OR in the request body:</p>
    
    <h3>Option 1: Headers (Recommended)</h3>
    <table>
      <tr><th>Header</th><th>Description</th></tr>
      <tr><td><code>X-Project-Id</code></td><td>Your project UUID</td></tr>
      <tr><td><code>X-Share-Token</code></td><td>Your editor/owner token UUID</td></tr>
    </table>

    <h3>Option 2: Request Body</h3>
    <pre><code>{
  "projectId": "your-project-uuid",
  "token": "your-editor-token-uuid",
  "items": [...]
}</code></pre>

    <h2>Request Body Schema</h2>
    <pre><code>{
  "projectId": "uuid",           // Optional if using headers
  "token": "uuid",               // Optional if using headers
  "items": [
    {
      "type": "text" | "image" | "binary",
      "content": "string",       // Text content or base64-encoded binary
      "title": "string",         // Optional: artifact title
      "fileName": "string",      // Optional: for images/binary
      "contentType": "string"    // Optional: MIME type for images/binary
    }
  ]
}</code></pre>

    <h2>Item Types</h2>
    <table>
      <tr><th>Type</th><th>Content Field</th><th>Notes</th></tr>
      <tr><td><code>text</code></td><td>Plain text</td><td>Stored directly as artifact content</td></tr>
      <tr><td><code>image</code></td><td>Base64-encoded image</td><td>Uploaded to storage, URL saved in artifact</td></tr>
      <tr><td><code>binary</code></td><td>Base64-encoded file</td><td>Any binary file (PDF, etc.)</td></tr>
    </table>

    <h2>Limits</h2>
    <ul>
      <li>Maximum payload size: <strong>50MB</strong></li>
      <li>Maximum items per request: <strong>100</strong></li>
      <li>Maximum single item size: <strong>10MB</strong></li>
    </ul>

    <h2>Examples</h2>

    <h3>cURL - Text Artifact</h3>
    <pre><code>curl -X POST ${endpoint} \\
  -H "Content-Type: application/json" \\
  -H "X-Project-Id: YOUR_PROJECT_UUID" \\
  -H "X-Share-Token: YOUR_EDITOR_TOKEN" \\
  -d '{
    "items": [
      {
        "type": "text",
        "content": "This is my artifact content from the webhook.",
        "title": "My Imported Note"
      }
    ]
  }'</code></pre>

    <h3>cURL - Image Upload</h3>
    <pre><code># First encode your image to base64
IMAGE_BASE64=$(base64 -i myimage.png)

curl -X POST ${endpoint} \\
  -H "Content-Type: application/json" \\
  -H "X-Project-Id: YOUR_PROJECT_UUID" \\
  -H "X-Share-Token: YOUR_EDITOR_TOKEN" \\
  -d "{
    \\"items\\": [
      {
        \\"type\\": \\"image\\",
        \\"content\\": \\"$IMAGE_BASE64\\",
        \\"fileName\\": \\"myimage.png\\",
        \\"contentType\\": \\"image/png\\",
        \\"title\\": \\"My Uploaded Image\\"
      }
    ]
  }"</code></pre>

    <h3>JavaScript / TypeScript</h3>
    <pre><code>const response = await fetch(
  "${endpoint}",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Project-Id": "YOUR_PROJECT_UUID",
      "X-Share-Token": "YOUR_EDITOR_TOKEN"
    },
    body: JSON.stringify({
      items: [
        {
          type: "text",
          content: "Hello from my app!",
          title: "Webhook Import"
        }
      ]
    })
  }
);

const result = await response.json();
console.log(result);</code></pre>

    <h3>Python</h3>
    <pre><code>import requests
import base64

# Text artifact
response = requests.post(
    "${endpoint}",
    headers={
        "Content-Type": "application/json",
        "X-Project-Id": "YOUR_PROJECT_UUID",
        "X-Share-Token": "YOUR_EDITOR_TOKEN"
    },
    json={
        "items": [
            {
                "type": "text",
                "content": "Hello from Python!",
                "title": "Python Import"
            }
        ]
    }
)
print(response.json())

# Image upload
with open("image.png", "rb") as f:
    image_base64 = base64.b64encode(f.read()).decode()

response = requests.post(
    "${endpoint}",
    headers={
        "Content-Type": "application/json",
        "X-Project-Id": "YOUR_PROJECT_UUID",
        "X-Share-Token": "YOUR_EDITOR_TOKEN"
    },
    json={
        "items": [
            {
                "type": "image",
                "content": image_base64,
                "fileName": "image.png",
                "contentType": "image/png",
                "title": "Python Image Upload"
            }
        ]
    }
)</code></pre>

    <h2>Response</h2>
    <pre><code>{
  "success": true,
  "message": "Processed 2 items: 2 created, 0 failed",
  "projectId": "your-project-uuid",
  "itemsReceived": 2,
  "itemsCreated": 2,
  "itemsFailed": 0,
  "results": [
    { "success": true, "artifactId": "uuid-1", "index": 0 },
    { "success": true, "artifactId": "uuid-2", "imageUrl": "https://...", "index": 1 }
  ],
  "processingTimeMs": 234
}</code></pre>

    <div class="info">
      <strong>ℹ️ Need Help?</strong><br>
      Visit <a href="https://pronghorn.red">pronghorn.red</a> to manage your projects and get your project ID and access tokens.
    </div>
  </div>
</body>
</html>`;
}
