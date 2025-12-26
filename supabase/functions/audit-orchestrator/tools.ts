// ==================== AUDIT ORCHESTRATOR TOOLS ====================
// These tools are what the orchestrator can invoke during analysis

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export const ORCHESTRATOR_TOOLS: ToolDefinition[] = [
  {
    name: "read_dataset_item",
    description: "Read the full content of a specific item from Dataset 1 or Dataset 2. Use this to get detailed information about a requirement, file, or artifact. Accepts partial UUIDs (8-char prefix).",
    parameters: {
      type: "object",
      properties: {
        dataset: { type: "string", enum: ["dataset1", "dataset2"], description: "Which dataset: 'dataset1' or 'dataset2' (also accepts 1, 2, or 'dataset_1'/'dataset_2')" },
        itemId: { type: "string", description: "The UUID or 8-char prefix of the item to read (e.g., 'a203ec4d')" },
      },
      required: ["dataset", "itemId"],
    },
  },
  {
    name: "query_knowledge_graph",
    description: "Query the knowledge graph to find concepts matching certain criteria. Returns nodes and their connections.",
    parameters: {
      type: "object",
      properties: {
        filter: { 
          type: "string", 
          enum: ["all", "dataset1_only", "dataset2_only", "shared", "orphans"],
          description: "Filter nodes by their source dataset connections" 
        },
        nodeType: { type: "string", description: "Optional: filter by node type (concept, theme, gap, requirement, etc.)" },
        limit: { type: "number", description: "Maximum number of nodes to return (default: 50)" },
      },
      required: ["filter"],
    },
  },
  {
    name: "get_concept_links",
    description: "Get all source artifacts linked to a specific concept node. Shows which Dataset 1 and Dataset 2 items are connected to this concept.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "The knowledge graph node ID (8-char prefix or full UUID)" },
      },
      required: ["nodeId"],
    },
  },
  {
    name: "write_blackboard",
    description: "Write an entry to the blackboard to record your thinking, findings, observations, or questions. This persists your reasoning for later reference.",
    parameters: {
      type: "object",
      properties: {
        entryType: { 
          type: "string", 
          enum: ["plan", "finding", "observation", "question", "conclusion", "tool_result"],
          description: "The type of entry being written" 
        },
        content: { type: "string", description: "The content to write to the blackboard" },
        confidence: { type: "number", description: "Confidence level from 0.0 to 1.0" },
        targetAgent: { type: "string", description: "Optional: if this entry is directed at a specific perspective" },
      },
      required: ["entryType", "content"],
    },
  },
  {
    name: "read_blackboard",
    description: "Read recent entries from the blackboard to understand previous reasoning and findings.",
    parameters: {
      type: "object",
      properties: {
        entryTypes: { 
          type: "array", 
          items: { type: "string" },
          description: "Optional: filter to specific entry types" 
        },
        limit: { type: "number", description: "Maximum number of entries to return (default: 20)" },
      },
    },
  },
  {
    name: "create_concept",
    description: "Create a new concept node in the knowledge graph. CRITICAL: You MUST specify which source artifacts this concept relates to. Accepts partial UUIDs (8-char prefix) for sourceElementIds.",
    parameters: {
      type: "object",
      properties: {
        label: { type: "string", description: "Short label for the concept (also accepts 'name')" },
        description: { type: "string", description: "Detailed description of what this concept represents" },
        nodeType: { 
          type: "string", 
          enum: ["dataset1_concept", "dataset2_concept", "shared_concept", "theme", "gap", "risk"],
          description: "The type of concept node" 
        },
        sourceDataset: { type: "string", enum: ["dataset1", "dataset2", "both"], description: "Which dataset this concept originates from" },
        sourceElementIds: { 
          type: "array", 
          items: { type: "string" },
          description: "REQUIRED: UUIDs or 8-char prefixes of the source artifacts this concept represents (e.g., ['a203ec4d', 'fb4f0382'])" 
        },
      },
      required: ["label", "description", "nodeType", "sourceDataset", "sourceElementIds"],
    },
  },
  {
    name: "link_concepts",
    description: "Create an edge between two existing concept nodes in the knowledge graph.",
    parameters: {
      type: "object",
      properties: {
        sourceNodeId: { type: "string", description: "The source node ID (8-char prefix or full UUID)" },
        targetNodeId: { type: "string", description: "The target node ID (8-char prefix or full UUID)" },
        edgeType: { 
          type: "string", 
          enum: ["relates_to", "implements", "depends_on", "conflicts_with", "supports", "covers"],
          description: "The type of relationship between the concepts" 
        },
        label: { type: "string", description: "Optional: human-readable label for this edge" },
      },
      required: ["sourceNodeId", "targetNodeId", "edgeType"],
    },
  },
  {
    name: "record_tesseract_cell",
    description: "Record an analysis finding for a specific Dataset 1 element. This populates the tesseract matrix showing alignment.",
    parameters: {
      type: "object",
      properties: {
        elementId: { type: "string", description: "The Dataset 1 element ID being analyzed" },
        elementLabel: { type: "string", description: "Human-readable label for the element" },
        step: { type: "number", description: "Analysis step number (1-5)" },
        stepLabel: { type: "string", description: "Label for this analysis step" },
        polarity: { type: "number", description: "Alignment score: -1 (gap/violation) to +1 (fully covered)" },
        criticality: { type: "string", enum: ["critical", "major", "minor", "info"], description: "Severity level" },
        evidenceSummary: { type: "string", description: "Summary of evidence for this assessment" },
      },
      required: ["elementId", "step", "polarity", "evidenceSummary"],
    },
  },
  {
    name: "finalize_venn",
    description: "Finalize the Venn diagram analysis, categorizing all elements into unique_to_d1, aligned, or unique_to_d2.",
    parameters: {
      type: "object",
      properties: {
        uniqueToD1: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              criticality: { type: "string" },
              evidence: { type: "string" },
            },
          },
          description: "Elements that exist only in Dataset 1 (gaps in coverage)",
        },
        aligned: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              criticality: { type: "string" },
              evidence: { type: "string" },
              sourceElement: { type: "string" },
              targetElement: { type: "string" },
            },
          },
          description: "Elements that are covered by both datasets",
        },
        uniqueToD2: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              criticality: { type: "string" },
              evidence: { type: "string" },
            },
          },
          description: "Elements that exist only in Dataset 2 (orphan implementations)",
        },
        summary: {
          type: "object",
          properties: {
            totalD1Coverage: { type: "number", description: "Percentage of D1 elements covered (0-100)" },
            totalD2Coverage: { type: "number", description: "Percentage of D2 elements that map to D1 (0-100)" },
            alignmentScore: { type: "number", description: "Overall alignment score (0-100)" },
          },
        },
      },
      required: ["uniqueToD1", "aligned", "uniqueToD2", "summary"],
    },
  },
];

// Explicit params schema - enforces exact parameter names for all LLMs
const TOOL_PARAMS_SCHEMA = {
  type: "object",
  properties: {
    // read_dataset_item params
    dataset: { type: "string", enum: ["dataset1", "dataset2"], description: "Which dataset to read from" },
    itemId: { type: "string", description: "The item ID or 8-char prefix to read" },
    
    // query_knowledge_graph params
    filter: { type: "string", enum: ["all", "dataset1_only", "dataset2_only", "shared", "orphans"], description: "Filter nodes by source dataset" },
    nodeType: { type: "string", description: "Filter by node type" },
    limit: { type: "integer", description: "Max results to return" },
    
    // get_concept_links params
    nodeId: { type: "string", description: "The knowledge graph node ID" },
    
    // write_blackboard params
    entryType: { type: "string", enum: ["plan", "finding", "observation", "question", "conclusion", "tool_result"], description: "Type of blackboard entry" },
    content: { type: "string", description: "The content to write" },
    confidence: { type: "number", description: "Confidence level 0.0-1.0" },
    targetAgent: { type: "string", description: "Optional target perspective" },
    
    // read_blackboard params
    entryTypes: { type: "array", items: { type: "string" }, description: "Filter to specific entry types" },
    
    // create_concept params
    label: { type: "string", description: "Short label for the concept" },
    description: { type: "string", description: "Detailed description of the concept" },
    sourceDataset: { type: "string", enum: ["dataset1", "dataset2", "both"], description: "Which dataset this concept originates from" },
    sourceElementIds: { type: "array", items: { type: "string" }, description: "REQUIRED: UUIDs or 8-char prefixes of source artifacts" },
    
    // link_concepts params
    sourceNodeId: { type: "string", description: "Source node ID" },
    targetNodeId: { type: "string", description: "Target node ID" },
    edgeType: { type: "string", enum: ["relates_to", "implements", "depends_on", "conflicts_with", "supports", "covers"], description: "Relationship type" },
    
    // record_tesseract_cell params
    elementId: { type: "string", description: "Dataset 1 element ID" },
    elementLabel: { type: "string", description: "Human-readable label" },
    step: { type: "integer", description: "Analysis step 1-5" },
    stepLabel: { type: "string", description: "Label for this step" },
    polarity: { type: "number", description: "Alignment score -1 to +1" },
    criticality: { type: "string", enum: ["critical", "major", "minor", "info"], description: "Severity level" },
    evidenceSummary: { type: "string", description: "Summary of evidence" },
    
    // finalize_venn params
    uniqueToD1: { 
      type: "array", 
      items: { 
        type: "object", 
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          criticality: { type: "string" },
          evidence: { type: "string" }
        }
      },
      description: "Elements unique to Dataset 1 (gaps)" 
    },
    aligned: { 
      type: "array", 
      items: { 
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          criticality: { type: "string" },
          evidence: { type: "string" },
          sourceElement: { type: "string" },
          targetElement: { type: "string" }
        }
      },
      description: "Elements present in both datasets" 
    },
    uniqueToD2: { 
      type: "array", 
      items: { 
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          criticality: { type: "string" },
          evidence: { type: "string" }
        }
      },
      description: "Elements unique to Dataset 2 (orphans)" 
    },
    summary: { 
      type: "object",
      properties: {
        totalD1Coverage: { type: "number" },
        totalD2Coverage: { type: "number" },
        alignmentScore: { type: "number" }
      },
      description: "Summary statistics" 
    },
  },
  additionalProperties: false,
};

// Convert tools to Grok response_format schema with explicit params
export function getGrokToolSchema() {
  return {
    type: "json_schema",
    json_schema: {
      name: "orchestrator_action",
      strict: true,
      schema: {
        type: "object",
        properties: {
          thinking: { type: "string", description: "Your internal reasoning about what to do next" },
          perspective: { 
            type: "string",
            enum: ["architect", "security", "business", "developer", "user"],
            description: "Which perspective lens you are applying" 
          },
          toolCalls: {
            type: "array",
            items: {
              type: "object",
              properties: {
                tool: { 
                  type: "string", 
                  enum: ["read_dataset_item", "query_knowledge_graph", "get_concept_links", 
                         "write_blackboard", "read_blackboard", "create_concept", 
                         "link_concepts", "record_tesseract_cell", "finalize_venn"],
                  description: "Name of the tool to invoke" 
                },
                params: TOOL_PARAMS_SCHEMA,
                rationale: { type: "string", description: "Why you are calling this tool" },
              },
              required: ["tool", "params"],
              additionalProperties: false,
            },
          },
          continueAnalysis: { type: "boolean", description: "Whether more analysis iterations are needed" },
        },
        required: ["thinking", "toolCalls", "continueAnalysis"],
        additionalProperties: false,
      },
    },
  };
}

// Convert tools to Claude tool format
export function getClaudeTools() {
  return ORCHESTRATOR_TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

// Convert tools to Gemini function declarations with explicit params
export function getGeminiFunctionDeclarations() {
  return {
    type: "object",
    properties: {
      thinking: { type: "string", description: "Your internal reasoning about what to do next" },
      perspective: { 
        type: "string",
        enum: ["architect", "security", "business", "developer", "user"],
        description: "Which perspective lens you are applying" 
      },
      toolCalls: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tool: { 
              type: "string", 
              enum: ["read_dataset_item", "query_knowledge_graph", "get_concept_links", 
                     "write_blackboard", "read_blackboard", "create_concept", 
                     "link_concepts", "record_tesseract_cell", "finalize_venn"],
              description: "Name of the tool to invoke" 
            },
            params: TOOL_PARAMS_SCHEMA,
            rationale: { type: "string", description: "Why you are calling this tool" },
          },
          required: ["tool", "params"],
        },
      },
      continueAnalysis: { type: "boolean", description: "Whether more analysis iterations are needed" },
    },
    required: ["thinking", "toolCalls", "continueAnalysis"],
  };
}
