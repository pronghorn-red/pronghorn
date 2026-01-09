import { ToolsManifest, AgentPromptSection } from '@/hooks/useProjectAgent';

// Generate tool list text from manifest for prompt
export function generateToolsListText(manifest: ToolsManifest | null): string {
  if (!manifest) return "{{TOOLS_LIST}}";
  
  // NOTE: No header here - the section title "Available Tools" already provides the header
  const lines: string[] = [];
  
  // File Operations
  lines.push("## FILE OPERATIONS\n");
  for (const [name, tool] of Object.entries(manifest.file_operations)) {
    if (!tool.enabled) continue;
    lines.push(`**${name}** [${tool.category}]`);
    lines.push(`  ${tool.description}`);
    if (Object.keys(tool.params).length > 0) {
      lines.push(`  Parameters:`);
      for (const [paramName, param] of Object.entries(tool.params)) {
        const required = param.required ? "(required)" : "(optional)";
        lines.push(`    - ${paramName}: ${param.type} ${required} - ${param.description}`);
      }
    }
    lines.push("");
  }
  
  // Project Exploration Tools
  lines.push("\n## PROJECT EXPLORATION TOOLS (READ-ONLY)\n");
  lines.push("You have READ-ONLY access to explore the entire project via these additional tools:\n");
  for (const [name, tool] of Object.entries(manifest.project_exploration_tools)) {
    if (!tool.enabled) continue;
    lines.push(`**${name}** [${tool.category}]`);
    lines.push(`  ${tool.description}`);
    if (Object.keys(tool.params).length > 0) {
      lines.push(`  Parameters:`);
      for (const [paramName, param] of Object.entries(tool.params)) {
        const required = param.required ? "(required)" : "(optional)";
        lines.push(`    - ${paramName}: ${param.type} ${required} - ${param.description}`);
      }
    }
    lines.push("");
  }
  lines.push("\nPROJECT EXPLORATION WORKFLOW:");
  lines.push("1. Start with project_inventory to see counts and previews of all categories");
  lines.push("2. Use project_category to load full details of categories you need");
  lines.push("3. Use project_elements to fetch specific items by ID");
  lines.push("\nThese tools are READ-ONLY. Use them to understand context and inform your file operations.");
  
  return lines.join("\n");
}

// Generate response schema text for prompt
export function generateResponseSchemaText(manifest: ToolsManifest | null): string {
  if (!manifest) return "{{RESPONSE_SCHEMA}}";
  
  const allToolNames = [
    ...Object.keys(manifest.file_operations),
    ...Object.keys(manifest.project_exploration_tools)
  ];
  
  return `When responding, structure your response as:
{
  "reasoning": "Your chain-of-thought reasoning about what to do next",
  "operations": [
    {
      "type": "${allToolNames[0] || "list_files"}" | "${allToolNames.slice(1, 4).join('" | "')}" | ...,
      "params": { /* tool-specific parameters from the AVAILABLE TOOLS section */ }
    }
  ],
  "blackboard_entry": {
    "entry_type": "planning" | "progress" | "decision" | "reasoning" | "next_steps" | "reflection",
    "content": "Your memory/reflection for this step"
  },
  "status": "in_progress" | "completed" | "requires_commit"
}

Available operation types: ${allToolNames.join(", ")}`;
}

export interface PromptPreviewResult {
  prompt: string;
  charCount: number;
  wordCount: number;
  tokenEstimate: number;
}

// Runtime variables that will be substituted at actual runtime
const RUNTIME_PLACEHOLDERS = [
  '{{PROJECT_CONTEXT}}',
  '{{CHAT_HISTORY}}', 
  '{{BLACKBOARD}}',
];

export function generatePromptPreview(
  sections: AgentPromptSection[],
  toolsManifest: ToolsManifest | null,
  options: {
    withFiles?: boolean;
    taskMode?: string;
    autoCommit?: string;
  } = {}
): PromptPreviewResult {
  const {
    withFiles = false,
    taskMode = 'task',
    autoCommit = 'false',
  } = options;

  // Generate dynamic content
  const toolsListText = generateToolsListText(toolsManifest);
  const responseSchemaText = generateResponseSchemaText(toolsManifest);

  // Build variable substitutions
  const variables: Record<string, string> = {
    '{{TOOLS_LIST}}': toolsListText,
    '{{RESPONSE_SCHEMA}}': responseSchemaText,
    '{{TASK_MODE}}': taskMode,
    '{{AUTO_COMMIT}}': autoCommit,
    '{{ATTACHED_FILES_LIST}}': withFiles ? '\n\n[File attachments would appear here]' : '',
    '{{CURRENT_ITERATION}}': '1',
    '{{MAX_ITERATIONS}}': '30',
    // Runtime placeholders - show placeholder text without HTML comments
    '{{PROJECT_CONTEXT}}': '{{PROJECT_CONTEXT}}',
    '{{CHAT_HISTORY}}': '{{CHAT_HISTORY}}',
    '{{BLACKBOARD}}': '{{BLACKBOARD}}',
  };

  // Filter sections based on files attached scenario
  const filteredSections = sections.filter(section => {
    const enabled = section.enabled ?? true;
    if (!enabled) return false;
    
    // Show appropriate attached files section
    if (withFiles) {
      return section.id !== 'attached_files_without';
    } else {
      return section.id !== 'attached_files_with';
    }
  });

  // Sort by order
  const sortedSections = [...filteredSections].sort((a, b) => a.order - b.order);

  // Build prompt by substituting variables in each section
  const promptParts: string[] = [];

  for (const section of sortedSections) {
    let content = section.content;
    
    // Substitute all variables
    for (const [variable, value] of Object.entries(variables)) {
      content = content.replace(new RegExp(variable.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
    
    promptParts.push(`=== ${section.title.toUpperCase()} ===\n${content}`);
  }

  const finalPrompt = promptParts.join('\n\n');

  return {
    prompt: finalPrompt,
    charCount: finalPrompt.length,
    wordCount: finalPrompt.split(/\s+/).filter(w => w.length > 0).length,
    tokenEstimate: Math.ceil(finalPrompt.length / 4), // Rough estimate: ~4 chars per token
  };
}

// Identify runtime placeholders in text for highlighting
export function identifyRuntimePlaceholders(text: string): { start: number; end: number; placeholder: string }[] {
  const results: { start: number; end: number; placeholder: string }[] = [];
  
  for (const placeholder of RUNTIME_PLACEHOLDERS) {
    let searchStart = 0;
    while (true) {
      const idx = text.indexOf(placeholder, searchStart);
      if (idx === -1) break;
      results.push({
        start: idx,
        end: idx + placeholder.length,
        placeholder,
      });
      searchStart = idx + 1;
    }
  }
  
  return results.sort((a, b) => a.start - b.start);
}
