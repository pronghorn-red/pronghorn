import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Battle-tested JSON parsing function with multiple fallback methods
function parseExpandResponse(rawText: string): any {
  const originalText = rawText.trim();
  let text = originalText;

  console.log("Parsing expand response, length:", rawText.length);

  const tryParse = (jsonStr: string, method: string): any | null => {
    try {
      const parsed = JSON.parse(jsonStr);
      console.log(`JSON parsed successfully via ${method}`);
      return parsed;
    } catch (e) {
      console.log(`JSON.parse failed in ${method}:`, (e as Error).message);
      return null;
    }
  };

  // Method 1: Direct parse
  let result = tryParse(text, "direct parse");
  if (result) return result;

  // Method 2: Extract from LAST ```json fence
  const lastFenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```[\s\S]*$/i);
  if (lastFenceMatch?.[1]) {
    const extracted = lastFenceMatch[1].trim();
    result = tryParse(extracted, "last code fence");
    if (result) return result;
  }

  // Method 3: Find ALL code blocks and try each (reverse order)
  const allFences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  for (let i = allFences.length - 1; i >= 0; i--) {
    const content = allFences[i][1].trim();
    if (content) {
      result = tryParse(content, `code fence #${i + 1} (reverse)`);
      if (result) return result;
    }
  }

  // Method 4: Array extraction (since we expect an array)
  const firstBracket = originalText.indexOf("[");
  const lastBracket = originalText.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const candidate = originalText.slice(firstBracket, lastBracket + 1);
    result = tryParse(candidate, "array extraction (raw)");
    if (result) return result;
  }

  // Method 5: Brace matching for object
  const firstBrace = originalText.indexOf("{");
  const lastBrace = originalText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = originalText.slice(firstBrace, lastBrace + 1);
    result = tryParse(candidate, "brace extraction (raw)");
    if (result) return result;
  }

  console.error("All JSON parsing methods failed");
  return { sub_requirements: [], parse_error: true };
}

// Grok JSON schema for expand requirement
function getGrokExpandSchema() {
  return {
    type: "json_schema",
    json_schema: {
      name: "expand_requirement",
      strict: true,
      schema: {
        type: "object",
        properties: {
          sub_requirements: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                content: { type: "string" },
                type: { 
                  type: "string",
                  enum: ["FEATURE", "STORY", "ACCEPTANCE_CRITERIA"]
                }
              },
              required: ["title", "content", "type"],
              additionalProperties: false
            }
          }
        },
        required: ["sub_requirements"],
        additionalProperties: false
      }
    }
  };
}

// Claude tool schema for expand requirement - with strict additionalProperties enforcement
function getClaudeExpandTool() {
  return {
    name: "return_sub_requirements",
    description: "Return the expanded sub-requirements. You MUST use this tool.",
    input_schema: {
      type: "object",
      properties: {
        sub_requirements: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              content: { type: "string" },
              type: { 
                type: "string",
                enum: ["FEATURE", "STORY", "ACCEPTANCE_CRITERIA"]
              }
            },
            required: ["title", "content", "type"],
            additionalProperties: false
          }
        }
      },
      required: ["sub_requirements"],
      additionalProperties: false
    }
  };
}

serve(async (req) => {
  console.log("[expand-requirement] Version: 2025-12-06-v1");
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { requirementId, projectId, shareToken: clientToken } = await req.json();
    
    if (!projectId) {
      throw new Error('Project ID is required');
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    });

    const shareToken = clientToken;

    if (!shareToken && !authHeader) {
      throw new Error('Share token is required for unauthenticated users');
    }

    // Get project settings for model selection
    const { data: project, error: projectError } = await supabase.rpc("get_project_with_token", {
      p_project_id: projectId,
      p_token: shareToken || null,
    });

    if (projectError) {
      console.error("Error fetching project:", projectError);
      throw projectError;
    }

    const selectedModel = project?.selected_model || "gemini-2.5-flash";
    const maxTokens = project?.max_tokens || 8192;
    console.log("Using model:", selectedModel, "maxTokens:", maxTokens);

    // Fetch all project requirements using token-based RPC
    const { data: allRequirements, error: reqError } = await supabase.rpc('get_requirements_with_token', {
      p_project_id: projectId,
      p_token: shareToken
    });

    if (reqError) {
      console.error('Error fetching requirements:', reqError);
      throw new Error('Failed to fetch requirements');
    }

    const requirement = allRequirements?.find((r: any) => r.id === requirementId);
    if (!requirement) {
      throw new Error('Requirement not found');
    }

    // Fetch linked standards using token-based RPC
    const { data: linkedStandards, error: linkedError } = await supabase.rpc('get_requirement_standards_with_token', {
      p_requirement_id: requirementId,
      p_token: shareToken
    });

    if (linkedError) {
      console.error('Error fetching linked standards:', linkedError);
    }

    // Fetch full standard details for context
    const standardDetails = [];
    if (linkedStandards && linkedStandards.length > 0) {
      for (const ls of linkedStandards) {
        const { data: standard } = await supabase
          .from('standards')
          .select('code, title, description, content')
          .eq('id', ls.standard_id)
          .single();
        
        if (standard) {
          standardDetails.push(standard);
        }
      }
    }

    // Build context for AI
    const standardsContext = standardDetails.map((std: any) => {
      return `${std.code}: ${std.title}\n${std.description || ''}`;
    }).join('\n\n') || 'No standards linked yet.';

    const treeContext = buildTreeContext(allRequirements || [], requirement.id);

    // Get existing siblings (children of same parent) for deduplication
    const existingSiblings = allRequirements?.filter((r: any) => r.parent_id === requirement.id) || [];
    const existingSiblingsContext = existingSiblings.length > 0 
      ? `EXISTING CHILDREN (DO NOT DUPLICATE):\n${existingSiblings.map((s: any) => `- ${s.code}: ${s.title}`).join('\n')}`
      : '';

    const childType = getChildType(requirement.type);

    const systemPrompt = `You are an expert requirements engineer. Your task is to expand a requirement into detailed sub-requirements.

CRITICAL: You MUST respond ONLY with valid JSON using the return_sub_requirements tool. No prose, no markdown.

EXPANSION GUIDELINES:
1. Generate 4-8 logical, comprehensive sub-requirements based on the parent type:
   - If EPIC: generate FEATURE sub-requirements (distinct functional areas)
   - If FEATURE: generate STORY sub-requirements (user-facing functionality)
   - If STORY: generate ACCEPTANCE_CRITERIA sub-requirements (testable conditions)
   - If ACCEPTANCE_CRITERIA: generate refined edge cases and validations

2. Each sub-requirement should be:
   - Specific and actionable
   - Measurable and testable
   - Aligned with linked standards
   - Unique (NOT duplicating existing children)

3. Consider both functional and non-functional aspects:
   - Core functionality
   - Error handling
   - Performance requirements
   - Security considerations
   - User experience aspects

4. For STORIES, use the format: "As a [role], I want to [action] so that [benefit]"
5. For ACCEPTANCE_CRITERIA, use: "Given [context], when [action], then [outcome]"`;

    const userPrompt = `REQUIREMENT TO EXPAND:
Code: ${requirement.code}
Type: ${requirement.type}
Title: ${requirement.title}
Content: ${requirement.content || 'No detailed content'}

PARENT CONTEXT:
${treeContext}

LINKED STANDARDS:
${standardsContext}

${existingSiblingsContext}

Generate ${childType} sub-requirements. Each should have:
- title: Clear, descriptive title
- content: Detailed description
- type: "${childType}"

Return your response using the return_sub_requirements tool with a sub_requirements array.`;

    let suggestions: any[] = [];
    let llmResponse: Response;
    let rawLlmResponse: any = null; // Capture raw response for debugging

    // Determine API and make request based on model
    if (selectedModel.startsWith("gemini")) {
      const geminiKey = Deno.env.get('GEMINI_API_KEY');
      if (!geminiKey) throw new Error("GEMINI_API_KEY not configured");

      console.log("Calling Gemini API...");
      llmResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: maxTokens,
              responseMimeType: "application/json",
              responseSchema: {
                type: "object",
                properties: {
                  sub_requirements: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        content: { type: "string" },
                        type: { type: "string", enum: ["FEATURE", "STORY", "ACCEPTANCE_CRITERIA"] }
                      },
                      required: ["title", "content", "type"]
                    }
                  }
                },
                required: ["sub_requirements"]
              }
            }
          })
        }
      );

      if (!llmResponse.ok) {
        const errorText = await llmResponse.text();
        console.error("Gemini API error:", llmResponse.status, errorText);
        throw new Error(`Gemini API error: ${llmResponse.status}`);
      }

      const geminiData = await llmResponse.json();
      rawLlmResponse = geminiData; // Capture for debugging
      console.log("Gemini response structure:", JSON.stringify({
        candidatesCount: geminiData.candidates?.length,
        hasContent: !!geminiData.candidates?.[0]?.content,
        partsCount: geminiData.candidates?.[0]?.content?.parts?.length
      }));
      const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      console.log("Gemini response text (first 500 chars):", responseText.substring(0, 500));
      const parsed = parseExpandResponse(responseText);
      suggestions = parsed.sub_requirements || parsed || [];
      console.log("Gemini parsed suggestions count:", suggestions.length);
      
    } else if (selectedModel.startsWith("claude")) {
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
      if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not configured");

      console.log("Calling Claude API with strict structured outputs...");
      llmResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "structured-outputs-2025-11-13",
        },
        body: JSON.stringify({
          model: selectedModel,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
          tools: [getClaudeExpandTool()],
          tool_choice: { type: "tool", name: "return_sub_requirements" },
        }),
      });

      if (!llmResponse.ok) {
        const errorText = await llmResponse.text();
        console.error("Claude API error:", llmResponse.status, errorText);
        throw new Error(`Claude API error: ${llmResponse.status}`);
      }

      const claudeData = await llmResponse.json();
      rawLlmResponse = claudeData; // Capture for debugging
      console.log("Claude response structure:", JSON.stringify({
        stop_reason: claudeData.stop_reason,
        contentBlocks: claudeData.content?.length,
        blockTypes: claudeData.content?.map((b: any) => b.type)
      }));
      
      // Explicit refusal handling
      if (claudeData.stop_reason === "refusal") {
        console.warn("Claude refused to complete - content may have triggered moderation");
      }
      
      const toolUseBlock = claudeData.content?.find((block: any) => block.type === "tool_use");
      if (toolUseBlock) {
        console.log("Claude tool_use block:", JSON.stringify({
          name: toolUseBlock.name,
          inputKeys: Object.keys(toolUseBlock.input || {}),
          inputType: typeof toolUseBlock.input?.sub_requirements
        }));
      }
      
      if (toolUseBlock && toolUseBlock.input) {
        let rawSubReqs = toolUseBlock.input.sub_requirements;
        
        // Handle case where Claude returns stringified JSON instead of array
        if (typeof rawSubReqs === 'string') {
          console.log("sub_requirements is a string, attempting to parse...");
          try {
            rawSubReqs = JSON.parse(rawSubReqs);
          } catch (e) {
            console.warn("Failed to parse stringified sub_requirements:", (e as Error).message);
            // Try parseExpandResponse as fallback for truncated JSON
            const parsed = parseExpandResponse(rawSubReqs);
            rawSubReqs = parsed.sub_requirements || parsed || [];
          }
        }
        
        suggestions = Array.isArray(rawSubReqs) ? rawSubReqs : [];
        console.log("Claude tool use parsed, sub_requirements count:", suggestions.length);
      } else {
        const textBlock = claudeData.content?.find((block: any) => block.type === "text");
        const text = textBlock?.text || JSON.stringify(claudeData.content);
        console.log("Claude fallback to text parsing, text (first 500):", text?.substring(0, 500));
        const parsed = parseExpandResponse(text);
        suggestions = parsed.sub_requirements || parsed || [];
      }
      
    } else if (selectedModel.startsWith("grok")) {
      const grokKey = Deno.env.get('GROK_API_KEY');
      if (!grokKey) throw new Error("GROK_API_KEY not configured");

      console.log("Calling Grok API with JSON schema...");
      llmResponse = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${grokKey}`
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: maxTokens,
          temperature: 0.7,
          response_format: getGrokExpandSchema(),
        })
      });

      if (!llmResponse.ok) {
        const errorText = await llmResponse.text();
        console.error("Grok API error:", llmResponse.status, errorText);
        throw new Error(`Grok API error: ${llmResponse.status}`);
      }

      const grokData = await llmResponse.json();
      rawLlmResponse = grokData; // Capture for debugging
      console.log("Grok response structure:", JSON.stringify({
        choicesCount: grokData.choices?.length,
        hasMessage: !!grokData.choices?.[0]?.message,
        finishReason: grokData.choices?.[0]?.finish_reason
      }));
      const responseText = grokData.choices?.[0]?.message?.content || '';
      console.log("Grok response text (first 500 chars):", responseText.substring(0, 500));
      const parsed = parseExpandResponse(responseText);
      suggestions = parsed.sub_requirements || parsed || [];
      console.log("Grok parsed suggestions count:", suggestions.length);
    } else {
      throw new Error(`Unsupported model: ${selectedModel}`);
    }

    // Ensure suggestions is an array
    if (!Array.isArray(suggestions)) {
      console.error("Suggestions is not an array:", typeof suggestions);
      suggestions = [];
    }

    console.log(`Parsed ${suggestions.length} sub-requirements`);

    // Insert new requirements via token-based RPC
    const inserted = [];
    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      const { data: newReq, error: insertError } = await supabase.rpc('insert_requirement_with_token', {
        p_project_id: projectId,
        p_token: shareToken,
        p_parent_id: requirementId,
        p_type: childType,
        p_title: s.title
      });

      if (insertError) {
        console.error('Insert error:', insertError);
        throw insertError;
      }

      // Update content separately since insert RPC may not support it
      if (s.content && newReq) {
        const { error: updateError } = await supabase.rpc('update_requirement_with_token', {
          p_id: newReq.id,
          p_token: shareToken,
          p_title: s.title,
          p_content: s.content
        });

        if (updateError) {
          console.error('Update error:', updateError);
        }
      }

      if (newReq) {
        inserted.push(newReq);
      }
    }

    // Broadcast refresh to all connected clients
    if (inserted.length > 0) {
      const channel = supabase.channel(`requirements-${projectId}`);
      await channel.send({
        type: 'broadcast',
        event: 'requirements_refresh',
        payload: { 
          projectId, 
          action: 'bulk_insert', 
          parentId: requirementId,
          count: inserted.length 
        }
      });
      console.log(`Broadcast sent for ${inserted.length} new requirements`);
    }

    // Build response payload
    const responsePayload: any = { 
      success: true, 
      requirements: inserted,
      count: inserted?.length || 0,
      model: selectedModel
    };

    // Include raw LLM response for debugging if no requirements were generated
    if (inserted.length === 0 && rawLlmResponse) {
      console.log("No requirements inserted, including raw LLM response in debug payload");
      responsePayload.debug = {
        rawResponse: rawLlmResponse,
        stopReason: rawLlmResponse.stop_reason || rawLlmResponse.choices?.[0]?.finish_reason,
        suggestionsCount: suggestions?.length || 0,
        suggestionsType: typeof suggestions,
        suggestionsValue: suggestions
      };
    }

    return new Response(
      JSON.stringify(responsePayload),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Expand requirement error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

function buildTreeContext(allReqs: any[], currentId: string): string {
  const current = allReqs.find(r => r.id === currentId);
  if (!current || !current.parent_id) return 'Root requirement';
  
  const parent = allReqs.find(r => r.id === current.parent_id);
  if (!parent) return 'No parent context';
  
  return `Parent: ${parent.code} - ${parent.title}\n${parent.content || ''}`;
}

function getChildType(parentType: string): string {
  switch (parentType) {
    case 'EPIC': return 'FEATURE';
    case 'FEATURE': return 'STORY';
    case 'STORY': return 'ACCEPTANCE_CRITERIA';
    case 'ACCEPTANCE_CRITERIA': return 'ACCEPTANCE_CRITERIA';
    default: return 'STORY';
  }
}
