import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      projectId, 
      shareToken, 
      imageData, 
      fileName, 
      content, 
      sourceType, 
      sourceId,
      // Title field
      title,
      // Provenance tracking fields
      provenanceId,
      provenancePath,
      provenancePage,
      provenanceTotalPages,
      // Upload-only mode: skip artifact creation
      uploadOnly
    } = await req.json();

    if (!projectId) {
      throw new Error('Project ID is required');
    }

    // Content is only required if we're creating an artifact
    if (!content && !uploadOnly) {
      throw new Error('Content is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    });

    // Validate project access using the token-based RPC pattern
    const { data: hasAccess, error: accessError } = await supabase.rpc('validate_project_access', {
      p_project_id: projectId,
      p_token: shareToken || null
    });

    if (accessError || !hasAccess) {
      throw new Error('Unauthorized: Invalid project access');
    }

    let publicUrl = null;

    // Only upload image if imageData is provided
    if (imageData) {
      // Convert base64 to blob
      const base64Data = imageData.split(',')[1] || imageData;
      const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      
      // Generate a unique filename with timestamp + random suffix to prevent conflicts
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const baseName = fileName ? fileName.replace(/\.[^.]+$/, '') : 'image';
      const extension = fileName?.split('.').pop() || 'png';
      const uniqueFileName = `${baseName}-${uniqueId}.${extension}`;
      
      // Upload to storage with unique filename
      const storagePath = `${projectId}/${uniqueFileName}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('artifact-images')
        .upload(storagePath, binaryData, {
          contentType: 'image/png',
          upsert: false
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(`Failed to upload image: ${uploadError.message}`);
      }

      // Get public URL
      const { data: { publicUrl: url } } = supabase.storage
        .from('artifact-images')
        .getPublicUrl(storagePath);
      
      publicUrl = url;
    }

    // If uploadOnly mode, skip artifact creation and just return the URL
    if (uploadOnly) {
      console.log(`Upload-only mode: skipping artifact creation, returning URL: ${publicUrl}`);
      return new Response(
        JSON.stringify({ artifact: null, url: publicUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create artifact using token-based RPC with title and provenance fields
    const { data: artifact, error: artifactError } = await supabase.rpc('insert_artifact_with_token', {
      p_project_id: projectId,
      p_token: shareToken || null,
      p_content: content,
      p_source_type: sourceType || null,
      p_source_id: sourceId || null,
      p_image_url: publicUrl,
      p_ai_title: title || null,
      p_provenance_id: provenanceId || null,
      p_provenance_path: provenancePath || null,
      p_provenance_page: provenancePage || null,
      p_provenance_total_pages: provenanceTotalPages || null
    });

    if (artifactError) {
      console.error('Artifact creation error:', artifactError);
      throw new Error(`Failed to create artifact: ${artifactError.message}`);
    }

    console.log(`Created artifact with provenance: id=${provenanceId}, path=${provenancePath}, page=${provenancePage}/${provenanceTotalPages}`);

    return new Response(
      JSON.stringify({ artifact, url: publicUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in upload-artifact-image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
