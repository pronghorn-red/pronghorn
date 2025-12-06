import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Battle-tested JSON parsing function with multiple fallback methods
function parseRequirementsResponse(rawText: string): any {
  const originalText = rawText.trim();
  let text = originalText;

  console.log("Parsing requirements response, length:", rawText.length);

  // Helper to try parsing safely
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

  // Method 2: Extract from LAST ```json fence (greedy regex with $ anchor)
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

  // Method 4: Brace matching on ORIGINAL text
  const firstBrace = originalText.indexOf("{");
  const lastBrace = originalText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = originalText.slice(firstBrace, lastBrace + 1);
    result = tryParse(candidate, "brace extraction (raw)");
    if (result) return result;

    // Try with whitespace normalization
    const cleaned = candidate.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    result = tryParse(cleaned, "brace extraction (cleaned)");
    if (result) return result;
  }

  // Method 5: Heuristic object match (last resort)
  const heuristicMatch = originalText.match(/(\{(?:[^{}]|"(?:\\.|[^"\\])*")*\})/);
  if (heuristicMatch) {
    result = tryParse(heuristicMatch[1], "heuristic object match");
    if (result) return result;
  }

  // Final fallback
  console.error("All JSON parsing methods failed");
  return { epics: [], parse_error: true };
}

// Grok JSON schema for requirements decomposition
function getGrokRequirementsSchema() {
  return {
    type: "json_schema",
    json_schema: {
      name: "requirements_decomposition",
      strict: true,
      schema: {
        type: "object",
        properties: {
          epics: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                features: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      stories: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            title: { type: "string" },
                            description: { type: "string" },
                            acceptanceCriteria: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  title: { type: "string" },
                                  description: { type: "string" }
                                },
                                required: ["title"],
                                additionalProperties: false
                              }
                            }
                          },
                          required: ["title"],
                          additionalProperties: false
                        }
                      }
                    },
                    required: ["title"],
                    additionalProperties: false
                  }
                }
              },
              required: ["title"],
              additionalProperties: false
            }
          }
        },
        required: ["epics"],
        additionalProperties: false
      }
    }
  };
}

// Claude tool schema for requirements decomposition
function getClaudeRequirementsTool() {
  return {
    name: "return_requirements",
    description: "Return the decomposed requirements structure. You MUST use this tool.",
    input_schema: {
      type: "object",
      properties: {
        epics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              features: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    stories: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          description: { type: "string" },
                          acceptanceCriteria: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                title: { type: "string" },
                                description: { type: "string" }
                              },
                              required: ["title"]
                            }
                          }
                        },
                        required: ["title"]
                      }
                    }
                  },
                  required: ["title"]
                }
              }
            },
            required: ["title"]
          }
        }
      },
      required: ["epics"]
    }
  };
}

// Gemini response schema for strict JSON
function getGeminiRequirementsSchema() {
  return {
    type: "object",
    properties: {
      epics: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            features: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  stories: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        acceptanceCriteria: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              title: { type: "string" },
                              description: { type: "string" }
                            },
                            required: ["title"]
                          }
                        }
                      },
                      required: ["title"]
                    }
                  }
                },
                required: ["title"]
              }
            }
          },
          required: ["title"]
        }
      }
    },
    required: ["epics"]
  };
}

// Format existing requirements for context
function formatExistingRequirements(requirements: any[]): string {
  if (!requirements || requirements.length === 0) {
    return "No existing requirements.";
  }

  // Group by type
  const epics = requirements.filter(r => r.type === 'EPIC');
  const features = requirements.filter(r => r.type === 'FEATURE');
  const stories = requirements.filter(r => r.type === 'STORY');
  const acs = requirements.filter(r => r.type === 'ACCEPTANCE_CRITERIA');

  let context = `EXISTING REQUIREMENTS (${requirements.length} total):\n\n`;
  
  if (epics.length > 0) {
    context += `EPICS (${epics.length}):\n`;
    epics.forEach(e => {
      context += `  - ${e.code || ''}: ${e.title}\n`;
      if (e.content) context += `    ${e.content.substring(0, 150)}...\n`;
    });
    context += '\n';
  }

  if (features.length > 0) {
    context += `FEATURES (${features.length}):\n`;
    features.slice(0, 15).forEach(f => {
      context += `  - ${f.code || ''}: ${f.title}\n`;
    });
    if (features.length > 15) context += `  ... and ${features.length - 15} more\n`;
    context += '\n';
  }

  if (stories.length > 0) {
    context += `STORIES (${stories.length}):\n`;
    stories.slice(0, 10).forEach(s => {
      context += `  - ${s.code || ''}: ${s.title}\n`;
    });
    if (stories.length > 10) context += `  ... and ${stories.length - 10} more\n`;
    context += '\n';
  }

  if (acs.length > 0) {
    context += `ACCEPTANCE CRITERIA (${acs.length}):\n`;
    acs.slice(0, 5).forEach(a => {
      context += `  - ${a.code || ''}: ${a.title}\n`;
    });
    if (acs.length > 5) context += `  ... and ${acs.length - 5} more\n`;
  }

  return context;
}

const systemPrompt = `You are an expert requirements analyst specializing in comprehensive requirements decomposition. Your task is to analyze unstructured text and decompose it into a complete, hierarchical structure of requirements.

HIERARCHY PATTERN: Epic → Feature → User Story → Acceptance Criteria

=== EPIC GENERATION GUIDELINES (CRITICAL) ===
You MUST generate 4-8 comprehensive Epics that cover ALL major functional areas of the described system. Each Epic should represent a distinct domain:

1. **Core Functionality Epic** - The primary user-facing features
2. **User Management Epic** - Authentication, authorization, profiles, roles
3. **Data Management Epic** - CRUD operations, data storage, import/export
4. **Integration Epic** - APIs, third-party services, webhooks
5. **Administration Epic** - Admin dashboards, configuration, settings
6. **Reporting & Analytics Epic** - Reports, dashboards, metrics
7. **Security & Compliance Epic** - Security controls, audit logs, compliance
8. **User Experience Epic** - UI/UX, notifications, accessibility

Not all projects need all 8, but NEVER generate fewer than 4 Epics. Analyze the input thoroughly.

=== FEATURE GENERATION ===
For each Epic, generate 3-6 Features representing specific capabilities:
- Each Feature should be a distinct, implementable capability
- Features should cover both happy paths and edge cases
- Consider non-functional requirements (performance, security, scalability)

=== USER STORY GENERATION ===
For each Feature, generate 2-4 User Stories using the format:
"As a [role], I want to [action] so that [benefit]"
- Identify different user roles (admin, user, guest, etc.)
- Cover different scenarios and use cases

=== ACCEPTANCE CRITERIA GENERATION ===
For each Story, generate 2-5 Acceptance Criteria using the format:
"Given [context], when [action], then [outcome]"
- Cover success scenarios
- Cover error handling
- Cover edge cases

=== DEDUPLICATION RULES ===
If EXISTING REQUIREMENTS are provided:
- DO NOT duplicate existing Epics, Features, or Stories with same/similar titles
- DO NOT create requirements that semantically overlap with existing ones
- ONLY add new, unique requirements that add distinct value
- Focus on gaps and missing areas not covered by existing requirements

=== RESPONSE FORMAT ===
You MUST respond ONLY with valid JSON using the return_requirements tool. No prose, no markdown, no explanations.

{
  "epics": [
    {
      "title": "Epic title - clear and descriptive",
      "description": "Detailed description of what this epic covers",
      "features": [
        {
          "title": "Feature title",
          "description": "Detailed feature description",
          "stories": [
            {
              "title": "As a [role], I want to [action] so that [benefit]",
              "description": "Additional story details",
              "acceptanceCriteria": [
                {
                  "title": "Given [context], when [action], then [outcome]",
                  "description": "Criteria details"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Received request body:", JSON.stringify(body));
    
    const { text, projectId, shareToken, attachedContext } = body;
    
    // Check if we have either text or attachedContext with content
    const hasAttachedContext = attachedContext && (
      attachedContext.projectMetadata ||
      attachedContext.artifacts?.length ||
      attachedContext.requirements?.length ||
      attachedContext.standards?.length ||
      attachedContext.techStacks?.length ||
      attachedContext.canvasNodes?.length ||
      attachedContext.chatSessions?.length ||
      attachedContext.files?.length
    );
    
    if (!projectId) {
      console.error("Missing projectId");
      throw new Error("Missing required parameter: projectId");
    }
    
    if (!text && !hasAttachedContext) {
      console.error("Missing both text and attachedContext");
      throw new Error("Please provide either text to decompose or project context");
    }

    // Validate projectId is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      console.error("Invalid projectId format:", projectId);
      throw new Error(`Invalid projectId format. Received: ${projectId}. Expected a valid UUID.`);
    }

    // Create Supabase client to store the requirements
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Get auth header for authenticated users
    const authHeader = req.headers.get('Authorization');
    
    // Create client with anon key (respects RLS)
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    });

    // Set share token if provided (for anonymous users)
    if (shareToken) {
      const { error: tokenError } = await supabase.rpc('set_share_token', { token: shareToken });
      if (tokenError) {
        console.error('Error setting share token:', tokenError);
        throw new Error('Invalid share token');
      }
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
    const maxTokens = project?.max_tokens || 32768;
    console.log("Using model:", selectedModel, "maxTokens:", maxTokens);

    // Fetch ALL existing project requirements for deduplication
    const { data: existingRequirements, error: existingError } = await supabase.rpc('get_requirements_with_token', {
      p_project_id: projectId,
      p_token: shareToken || null
    });

    if (existingError) {
      console.error("Error fetching existing requirements:", existingError);
      // Continue anyway - we'll generate without deduplication context
    }

    const existingRequirementsContext = formatExistingRequirements(existingRequirements || []);
    console.log("Existing requirements count:", existingRequirements?.length || 0);

    console.log("Decomposing requirements for project:", projectId);
    console.log("Input text length:", text?.length || 0);

    // Build context string from attached context
    let contextString = '';
    
    if (attachedContext) {
      if (attachedContext.projectMetadata) {
        const pm = attachedContext.projectMetadata;
        contextString += `PROJECT METADATA:\n`;
        contextString += `- Name: ${pm.name || 'N/A'}\n`;
        contextString += `- Description: ${pm.description || 'N/A'}\n`;
        contextString += `- Status: ${pm.status || 'N/A'}\n`;
        contextString += `- Priority: ${pm.priority || 'N/A'}\n`;
        contextString += `- Scope: ${pm.scope || 'N/A'}\n\n`;
      }
      
      if (attachedContext.standards?.length > 0) {
        contextString += `LINKED STANDARDS (${attachedContext.standards.length}):\n`;
        attachedContext.standards.forEach((s: any) => {
          contextString += `- ${s.code || ''} ${s.title}: ${s.description || ''}\n`;
        });
        contextString += '\n';
      }
      
      if (attachedContext.techStacks?.length > 0) {
        contextString += `TECH STACKS (${attachedContext.techStacks.length}):\n`;
        attachedContext.techStacks.forEach((t: any) => {
          contextString += `- ${t.name}${t.type ? ` (${t.type})` : ''}: ${t.description || ''}\n`;
        });
        contextString += '\n';
      }
      
      if (attachedContext.artifacts?.length > 0) {
        contextString += `ARTIFACTS (${attachedContext.artifacts.length}):\n`;
        attachedContext.artifacts.forEach((a: any) => {
          contextString += `--- ${a.ai_title || a.title || 'Artifact'} ---\n`;
          contextString += `${a.content?.substring(0, 500)}${a.content?.length > 500 ? '...' : ''}\n\n`;
        });
      }
      
      if (attachedContext.canvasNodes?.length > 0) {
        contextString += `CANVAS ARCHITECTURE (${attachedContext.canvasNodes.length} nodes):\n`;
        attachedContext.canvasNodes.forEach((n: any) => {
          const data = n.data || {};
          contextString += `- [${n.type}] ${data.label || data.title || 'Node'}\n`;
          if (data.description) contextString += `  ${data.description.substring(0, 100)}...\n`;
        });
        contextString += '\n';
      }
      
      if (attachedContext.chatSessions?.length > 0) {
        contextString += `CHAT SESSIONS (${attachedContext.chatSessions.length}):\n`;
        attachedContext.chatSessions.forEach((c: any) => {
          contextString += `- ${c.ai_title || c.title || 'Chat'}\n`;
          if (c.ai_summary) contextString += `  Summary: ${c.ai_summary.substring(0, 200)}...\n`;
        });
        contextString += '\n';
      }
      
      if (attachedContext.files?.length > 0) {
        contextString += `REPOSITORY FILES (${attachedContext.files.length}):\n`;
        attachedContext.files.forEach((f: any) => {
          contextString += `--- ${f.path} ---\n`;
          contextString += `${f.content?.substring(0, 300)}${f.content?.length > 300 ? '...' : ''}\n\n`;
        });
      }
    }

    console.log("Context string length:", contextString.length);

    // Build user message with existing requirements context for deduplication
    let userMessage = '';
    
    // Add existing requirements context first (for deduplication)
    if (existingRequirements && existingRequirements.length > 0) {
      userMessage += `${existingRequirementsContext}\n\n`;
      userMessage += `IMPORTANT: Review the existing requirements above. DO NOT duplicate them. Only generate NEW requirements that add unique value.\n\n`;
    }
    
    // Add project context
    if (contextString) {
      userMessage += `PROJECT CONTEXT:\n${contextString}\n\n`;
    }
    
    // Add the main instruction
    if (text) {
      userMessage += `DECOMPOSE THE FOLLOWING TEXT INTO COMPREHENSIVE REQUIREMENTS:\n\n${text}`;
    } else {
      userMessage += `Based on the attached project context above, generate comprehensive requirements covering all major functional areas. Create 4-8 Epics with Features, Stories, and Acceptance Criteria.`;
    }

    // Determine API key and endpoint based on model
    let apiKey: string | undefined;
    let llmResponse: Response;

    if (selectedModel.startsWith("gemini")) {
      apiKey = Deno.env.get("GEMINI_API_KEY");
      if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

      console.log("Calling Gemini API with schema enforcement...");
      llmResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: userMessage }] }],
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature: 0.7,
              responseMimeType: "application/json",
              responseSchema: getGeminiRequirementsSchema(),
            },
          }),
        }
      );
    } else if (selectedModel.startsWith("claude")) {
      apiKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

      console.log("Calling Claude API with strict tool use...");
      llmResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: selectedModel,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
          tools: [getClaudeRequirementsTool()],
          tool_choice: { type: "tool", name: "return_requirements" },
        }),
      });
    } else if (selectedModel.startsWith("grok")) {
      apiKey = Deno.env.get("GROK_API_KEY");
      if (!apiKey) throw new Error("GROK_API_KEY is not configured");

      console.log("Calling Grok API with JSON schema enforcement...");
      llmResponse = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          max_tokens: maxTokens,
          temperature: 0.7,
          response_format: getGrokRequirementsSchema(),
        }),
      });
    } else {
      throw new Error(`Unsupported model: ${selectedModel}`);
    }

    // Handle rate limits and errors
    if (!llmResponse.ok) {
      if (llmResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (llmResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please check your API credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await llmResponse.text();
      console.error("LLM API error:", llmResponse.status, errorText);
      throw new Error(`LLM API error: ${llmResponse.status} - ${errorText}`);
    }

    const llmData = await llmResponse.json();
    console.log("LLM response received, parsing...");
    
    // Parse the response based on model type
    let requirements: any;
    
    if (selectedModel.startsWith("gemini")) {
      const text = llmData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        console.error("No text in Gemini response:", JSON.stringify(llmData));
        throw new Error("No response content from Gemini");
      }
      requirements = parseRequirementsResponse(text);
    } else if (selectedModel.startsWith("claude")) {
      // Claude with strict tool use returns response in tool_use block
      const toolUseBlock = llmData.content?.find((block: any) => block.type === "tool_use");
      if (toolUseBlock && toolUseBlock.input) {
        requirements = toolUseBlock.input;
        console.log("Claude strict tool use response parsed directly");
      } else {
        // Fallback to text content with robust parser
        const textBlock = llmData.content?.find((block: any) => block.type === "text");
        const text = textBlock?.text || JSON.stringify(llmData.content);
        console.warn("No tool_use block found, falling back to text parsing");
        requirements = parseRequirementsResponse(text);
      }
    } else if (selectedModel.startsWith("grok")) {
      const text = llmData.choices?.[0]?.message?.content;
      if (!text) {
        console.error("No text in Grok response:", JSON.stringify(llmData));
        throw new Error("No response content from Grok");
      }
      requirements = parseRequirementsResponse(text);
    }

    // Validate the parsed structure
    if (!requirements || !requirements.epics || !Array.isArray(requirements.epics)) {
      console.error("Invalid requirements structure:", JSON.stringify(requirements));
      throw new Error("Failed to parse requirements structure from AI response");
    }

    if (requirements.parse_error) {
      console.error("Parse error flag set, no valid JSON found");
      throw new Error("Failed to parse requirements structure from AI response");
    }

    console.log(`Successfully parsed ${requirements.epics.length} epics`);

    // Validate minimum epic count
    if (requirements.epics.length < 2) {
      console.warn(`Only ${requirements.epics.length} epics generated, expected 4-8`);
    }

    // Insert requirements into database using token-based RPC
    console.log("Inserting requirements into database...");

    for (const epic of requirements.epics) {
      const { data: epicData, error: epicError } = await supabase.rpc('insert_requirement_with_token', {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_parent_id: null,
        p_type: "EPIC",
        p_title: epic.title,
      });

      if (epicError) {
        console.error("Error inserting epic:", epicError);
        throw epicError;
      }

      // Update with content if present
      if (epic.description) {
        const { error: updateError } = await supabase.rpc('update_requirement_with_token', {
          p_id: epicData.id,
          p_token: shareToken || null,
          p_title: epic.title,
          p_content: epic.description,
        });
        if (updateError) {
          console.error("Error updating epic content:", updateError);
        }
      }

      for (const feature of epic.features || []) {
        const { data: featureData, error: featureError } = await supabase.rpc('insert_requirement_with_token', {
          p_project_id: projectId,
          p_token: shareToken || null,
          p_parent_id: epicData.id,
          p_type: "FEATURE",
          p_title: feature.title,
        });

        if (featureError) {
          console.error("Error inserting feature:", featureError);
          throw featureError;
        }

        // Update with content if present
        if (feature.description) {
          const { error: updateError } = await supabase.rpc('update_requirement_with_token', {
            p_id: featureData.id,
            p_token: shareToken || null,
            p_title: feature.title,
            p_content: feature.description,
          });
          if (updateError) {
            console.error("Error updating feature content:", updateError);
          }
        }

        for (const story of feature.stories || []) {
          const { data: storyData, error: storyError } = await supabase.rpc('insert_requirement_with_token', {
            p_project_id: projectId,
            p_token: shareToken || null,
            p_parent_id: featureData.id,
            p_type: "STORY",
            p_title: story.title,
          });

          if (storyError) {
            console.error("Error inserting story:", storyError);
            throw storyError;
          }

          // Update with content if present
          if (story.description) {
            const { error: updateError } = await supabase.rpc('update_requirement_with_token', {
              p_id: storyData.id,
              p_token: shareToken || null,
              p_title: story.title,
              p_content: story.description,
            });
            if (updateError) {
              console.error("Error updating story content:", updateError);
            }
          }

          for (const criteria of story.acceptanceCriteria || []) {
            const { data: criteriaData, error: criteriaError } = await supabase.rpc('insert_requirement_with_token', {
              p_project_id: projectId,
              p_token: shareToken || null,
              p_parent_id: storyData.id,
              p_type: "ACCEPTANCE_CRITERIA",
              p_title: criteria.title,
            });

            if (criteriaError) {
              console.error("Error inserting criteria:", criteriaError);
              throw criteriaError;
            }

            // Update with content if present
            if (criteria.description) {
              const { error: updateError } = await supabase.rpc('update_requirement_with_token', {
                p_id: criteriaData.id,
                p_token: shareToken || null,
                p_title: criteria.title,
                p_content: criteria.description,
              });
              if (updateError) {
                console.error("Error updating criteria content:", updateError);
              }
            }
          }
        }
      }
    }

    console.log("Requirements decomposition complete");

    // Broadcast refresh to all connected clients
    if (requirements.epics.length > 0) {
      const channel = supabase.channel(`requirements-${projectId}`);
      await channel.send({
        type: 'broadcast',
        event: 'requirements_refresh',
        payload: { 
          projectId, 
          action: 'bulk_decompose', 
          epicCount: requirements.epics.length 
        }
      });
      console.log(`Broadcast sent for ${requirements.epics.length} decomposed epics`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Requirements decomposed and saved successfully",
        epicCount: requirements.epics.length,
        model: selectedModel
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in decompose-requirements:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
