import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DatabaseImportRequest {
  projectId: string;
  shareToken: string;
  databaseId?: string;
  connectionId?: string;
  action: 'propose_schema' | 'propose_mapping';
  sampleData: {
    headers: string[];
    rows: any[][];
    totalRows: number;
  };
  fileType: 'excel' | 'csv' | 'json';
  intent: 'create_new' | 'import_existing';
  targetTable?: string;
  existingSchema?: any[];
  userInstructions?: string;
  selectedModel?: string;
}

interface ColumnMapping {
  sourceColumn: string;
  targetColumn: string | null;
  ignored: boolean;
  casting: string | null;
  constantValue?: string;
}

interface ColumnTypeInfo {
  name: string;
  inferredType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  shouldIndex: boolean;
}

// Tool definitions for the LLM
const toolDefinitions = {
  propose_create_table: {
    name: "propose_create_table",
    description: "Propose a CREATE TABLE statement based on the analyzed data",
    parameters: {
      type: "object",
      properties: {
        table_name: { type: "string", description: "Sanitized table name" },
        columns: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: { type: "string", enum: ["TEXT", "INTEGER", "BIGINT", "NUMERIC", "BOOLEAN", "DATE", "TIMESTAMP WITH TIME ZONE", "JSONB"] },
              nullable: { type: "boolean" },
              is_primary_key: { type: "boolean" },
              is_unique: { type: "boolean" },
              should_index: { type: "boolean" }
            },
            required: ["name", "type", "nullable"]
          }
        },
        indexes: { type: "array", items: { type: "string" } }
      },
      required: ["table_name", "columns"]
    }
  },
  propose_field_mapping: {
    name: "propose_field_mapping",
    description: "Propose field mappings from source columns to target table columns",
    parameters: {
      type: "object",
      properties: {
        mappings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              source_column: { type: "string" },
              target_column: { type: "string" },
              casting: { type: "string", enum: ["none", "to_integer", "to_numeric", "to_boolean", "to_date", "to_timestamp", "to_text"] },
              ignored: { type: "boolean" }
            },
            required: ["source_column", "target_column", "ignored"]
          }
        }
      },
      required: ["mappings"]
    }
  }
};

// Response schema for structured output
const responseSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["create_new", "map_to_existing"] },
    proposed_table_name: { type: "string" },
    columns: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string" },
          nullable: { type: "boolean" },
          is_primary_key: { type: "boolean" },
          is_unique: { type: "boolean" },
          should_index: { type: "boolean" }
        },
        required: ["name", "type", "nullable"]
      }
    },
    column_mappings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source_column: { type: "string" },
          target_column: { type: "string" },
          casting: { type: "string" },
          ignored: { type: "boolean" }
        },
        required: ["source_column"]
      }
    },
    create_table_sql: { type: "string" },
    indexes: { type: "array", items: { type: "string" } },
    explanation: { type: "string" }
  },
  required: ["action", "explanation"]
};

async function callGrok(prompt: string, systemPrompt: string): Promise<any> {
  const apiKey = Deno.env.get('GROK_API_KEY');
  if (!apiKey) throw new Error('GROK_API_KEY not configured');

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-3-fast',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "database_import_response",
          strict: true,
          schema: responseSchema
        }
      },
      temperature: 0.3,
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Grok API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

async function callClaude(prompt: string, systemPrompt: string): Promise<any> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'tools-2024-04-04'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      tools: [{
        name: "respond_with_analysis",
        description: "Provide the database import analysis response",
        input_schema: responseSchema
      }],
      tool_choice: { type: "tool", name: "respond_with_analysis" }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const toolUse = data.content.find((block: any) => block.type === 'tool_use');
  if (!toolUse) throw new Error('No tool use in Claude response');
  return toolUse.input;
}

async function callGemini(prompt: string, systemPrompt: string): Promise<any> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${systemPrompt}\n\n${prompt}` }]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          temperature: 0.3,
          maxOutputTokens: 4096
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;
  return JSON.parse(text);
}

function buildSystemPrompt(): string {
  return `You are a database schema and data import expert. Your task is to analyze sample data from files (Excel, CSV, or JSON) and propose optimal database table structures or field mappings.

GUIDELINES:
1. For table creation:
   - Sanitize column names (lowercase, replace spaces with underscores, remove special characters)
   - Infer appropriate PostgreSQL types based on sample data
   - Suggest primary keys (look for 'id' columns or unique identifiers)
   - Suggest indexes for columns likely to be queried (foreign keys, timestamps, status fields)
   - Default to nullable unless data shows no nulls and column appears required

2. For field mapping:
   - Match columns semantically, not just by exact name
   - Consider common variations (e.g., "firstName" matches "first_name")
   - Suggest appropriate type castings when source and target types differ
   - Mark columns to ignore if they don't have a logical target

3. Type inference priority:
   - If all values are integers → INTEGER or BIGINT (based on magnitude)
   - If values have decimals → NUMERIC
   - If values are "true"/"false" or 0/1 → BOOLEAN
   - If values match date patterns → DATE or TIMESTAMP WITH TIME ZONE
   - Otherwise → TEXT

4. Always explain your reasoning briefly in the explanation field.`;
}

function buildUserPrompt(request: DatabaseImportRequest): string {
  const { sampleData, fileType, intent, targetTable, existingSchema, userInstructions } = request;
  
  let prompt = `Analyze this ${fileType.toUpperCase()} data for database import.

FILE TYPE: ${fileType}
INTENT: ${intent === 'create_new' ? 'Create new table(s)' : 'Map to existing table'}
TOTAL ROWS: ${sampleData.totalRows}

HEADERS:
${sampleData.headers.join(', ')}

SAMPLE DATA (first ${Math.min(sampleData.rows.length, 10)} rows):
${sampleData.rows.slice(0, 10).map((row, i) => `Row ${i + 1}: ${JSON.stringify(row)}`).join('\n')}
`;

  if (intent === 'import_existing' && targetTable && existingSchema) {
    const tableSchema = existingSchema.find(t => t.table_name === targetTable);
    if (tableSchema) {
      prompt += `\nTARGET TABLE: ${targetTable}
TARGET COLUMNS:
${tableSchema.columns.map((c: any) => `- ${c.column_name} (${c.data_type}, ${c.is_nullable === 'YES' ? 'nullable' : 'not null'})`).join('\n')}
`;
    }
  }

  if (userInstructions) {
    prompt += `\nUSER INSTRUCTIONS: ${userInstructions}`;
  }

  prompt += `\n\nProvide your analysis as a JSON response with the appropriate action, column definitions or mappings, and explanation.`;

  return prompt;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: DatabaseImportRequest = await req.json();
    const { projectId, shareToken, selectedModel } = request;

    // Validate access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} }
    });

    const { data: roleData, error: roleError } = await supabase.rpc('authorize_project_access', {
      p_project_id: projectId,
      p_token: shareToken || null
    });

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[database-agent-import] Processing ${request.action} for project ${projectId}`);

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(request);

    let result: any;
    const model = selectedModel?.toLowerCase() || 'grok';

    try {
      if (model.includes('claude') || model.includes('anthropic')) {
        console.log('[database-agent-import] Using Claude');
        result = await callClaude(userPrompt, systemPrompt);
      } else if (model.includes('gemini') || model.includes('google')) {
        console.log('[database-agent-import] Using Gemini');
        result = await callGemini(userPrompt, systemPrompt);
      } else {
        console.log('[database-agent-import] Using Grok (default)');
        result = await callGrok(userPrompt, systemPrompt);
      }
    } catch (llmError: unknown) {
      const errorMessage = llmError instanceof Error ? llmError.message : 'Unknown error';
      console.error('[database-agent-import] LLM error:', errorMessage);
      return new Response(
        JSON.stringify({ 
          error: 'AI analysis failed', 
          details: errorMessage,
          fallbackToManual: true 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[database-agent-import] AI analysis complete');

    // Transform response to match frontend expectations
    const response = {
      action: result.action,
      proposedTableName: result.proposed_table_name,
      columns: result.columns?.map((col: any) => ({
        name: col.name,
        inferredType: col.type,
        nullable: col.nullable ?? true,
        isPrimaryKey: col.is_primary_key ?? false,
        isUnique: col.is_unique ?? false,
        shouldIndex: col.should_index ?? false
      })),
      columnMappings: result.column_mappings?.map((m: any) => ({
        sourceColumn: m.source_column,
        targetColumn: m.target_column || null,
        ignored: m.ignored ?? false,
        casting: m.casting || null
      })),
      createTableSQL: result.create_table_sql,
      indexes: result.indexes || [],
      explanation: result.explanation
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[database-agent-import] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
