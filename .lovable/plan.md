
# Fix: Make Agents Strictly Follow Attached Standards

## Problem Summary

When users attach standards via the ProjectSelector, the **Chat window** correctly follows them but the **Coding Agent** and **Collaboration Agent** ignore them. Investigation revealed three root causes:

1. **Collaboration Agent Truncates Standards**: Only includes `name` and `description`, ignoring the actual markdown content in `content` and `long_description` fields
2. **No Enforcement Language**: Neither agent has instructions telling the LLM that attached standards are MANDATORY and take precedence
3. **Context Positioning**: Standards are buried in the middle of prompts without reinforcement near the task

## Solution Overview

| Agent | Changes Required |
|-------|-----------------|
| Collaboration Agent | Fix truncated standards (match coding agent pattern) |
| Coding Agent | Add enforcement section to prompt template |
| Both | Add pre-task reminder about standards compliance |

---

## Part 1: Fix Collaboration Agent Standards Handling

### File: `supabase/functions/collaboration-agent-orchestrator/index.ts`

**Current Code (lines 158-161)**:
```typescript
if (attachedContext.standards?.length) {
  parts.push(`STANDARDS:\n${attachedContext.standards.map((s: any) => 
    `- ${s.name}: ${s.description || ''}`).join('\n')}`);
}
```

**New Code** - Match the coding agent pattern with full content:
```typescript
if (attachedContext.standards?.length) {
  const allStandardsContent = attachedContext.standards.map((s: any) => {
    const code = s.code || 'STD';
    const title = s.title || s.name || 'Untitled Standard';
    let standardStr = `### STANDARD: ${code} - ${title}`;
    
    if (s.description) {
      standardStr += `\n**Description:** ${s.description}`;
    }
    
    if (s.content) {
      standardStr += `\n\n**Content:**\n${s.content}`;
    }
    
    if (s.long_description && s.long_description !== s.content) {
      standardStr += `\n\n**Extended Documentation:**\n${s.long_description}`;
    }
    
    return standardStr;
  }).join("\n\n---\n\n");
  
  parts.push(`ATTACHED STANDARDS (MANDATORY - FULL CONTENT):\n\n${allStandardsContent}`);
}
```

**Also fix Tech Stacks (lines 163-165)**:
```typescript
if (attachedContext.techStacks?.length) {
  const allStacksContent = attachedContext.techStacks.map((t: any) => {
    const type = t.type ? ` [${t.type}]` : "";
    const version = t.version ? ` v${t.version}` : "";
    let stackStr = `### TECH STACK: ${t.name}${type}${version}`;
    
    if (t.description) {
      stackStr += `\n**Description:** ${t.description}`;
    }
    
    if (t.long_description) {
      stackStr += `\n\n**Documentation:**\n${t.long_description}`;
    }
    
    return stackStr;
  }).join("\n\n---\n\n");
  
  parts.push(`ATTACHED TECH STACKS (FULL CONTENT):\n\n${allStacksContent}`);
}
```

---

## Part 2: Add Enforcement Language to Coding Agent Prompt Template

### File: `public/data/codingAgentPromptTemplate.json`

Add a new section after `critical_rules` (order 4.5) that explicitly instructs the agent about standards compliance:

```json
{
  "id": "context_compliance",
  "title": "Attached Context Compliance",
  "type": "static",
  "editable": "editable",
  "order": 4.5,
  "description": "Rules for handling user-attached standards and context",
  "variables": [],
  "content": "=== ATTACHED CONTEXT COMPLIANCE (MANDATORY) ===\n\nWhen the user attaches Standards, Tech Stacks, or other context via the Project Selector:\n\n1. **STANDARDS ARE MANDATORY**: If the user attached design system standards, component libraries, or coding guidelines - you MUST follow them EXACTLY. They take PRECEDENCE over your default training.\n\n2. **DO NOT USE DEFAULTS THAT CONFLICT**: If attached standards specify:\n   - Specific CSS files → use those files, not generic Tailwind classes\n   - Component structures → follow that structure, not your preferred patterns\n   - Layout systems → implement their layout, not generic flexbox/grid\n   - Asset requirements → include those assets, don't skip them\n\n3. **READ THE FULL CONTENT**: Standards include detailed markdown documentation. Read and follow ALL sections, not just the title/description.\n\n4. **ACKNOWLEDGE IN REASONING**: When making implementation decisions, explicitly reference which attached standards you are following.\n\n5. **ASK IF UNCLEAR**: If attached standards conflict with each other or the user's request, ask for clarification rather than guessing.\n\nFAILURE TO FOLLOW ATTACHED STANDARDS IS A CRITICAL ERROR."
}
```

---

## Part 3: Add Pre-Task Reminder in Coding Agent Orchestrator

### File: `supabase/functions/coding-agent-orchestrator/index.ts`

In the context summary builder (around line 694), add a standards reminder that gets injected near the task:

After building the standards content, add a reminder flag:
```typescript
let hasStandards = false;
if (projectContext.standards?.length > 0) {
  hasStandards = true;
  // ... existing standards handling ...
}
```

Then when building the final contextSummary, append a reminder if standards exist:
```typescript
if (hasStandards) {
  parts.push(`\n⚠️ REMINDER: The user has attached ${projectContext.standards.length} MANDATORY STANDARD(S). You MUST follow them exactly. Do not use default patterns that conflict with the attached standards.`);
}
```

---

## Part 4: Add Pre-Task Reminder in Collaboration Agent

### File: `supabase/functions/collaboration-agent-orchestrator/index.ts`

Add similar reminder logic after building the `attachedContextStr`:

```typescript
// After line 188 where attachedContextStr is joined
if (attachedContext?.standards?.length > 0) {
  attachedContextStr += `\n\n⚠️ MANDATORY COMPLIANCE: The user has attached ${attachedContext.standards.length} standard(s). Your edits MUST comply with these standards. Reference them explicitly in your reasoning.`;
}
```

---

## Implementation Checklist

| Step | File | Action |
|------|------|--------|
| 1 | `supabase/functions/collaboration-agent-orchestrator/index.ts` | Fix truncated standards/techStacks (lines 158-166) |
| 2 | `supabase/functions/collaboration-agent-orchestrator/index.ts` | Add reminder after attachedContextStr (after line 188) |
| 3 | `public/data/codingAgentPromptTemplate.json` | Add new "context_compliance" section |
| 4 | `supabase/functions/coding-agent-orchestrator/index.ts` | Add reminder near task description |
| 5 | Deploy both edge functions |
| 6 | Test by attaching Alberta Design System standards in Build |

---

## Expected Outcome

After these changes:
- **Collaboration Agent** will receive full standards content (not just name/description)
- **Both agents** will have explicit instructions that attached standards are MANDATORY
- **Both agents** will have a reminder near the task that reinforces compliance
- **Agent reasoning** will explicitly reference which standards are being followed
- Results will match Claude Console and Pronghorn Chat behavior
