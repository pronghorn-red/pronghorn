

## Plan: Fix Coding Agent Edit Corruption Issues

### Problem Summary

After analyzing the agent's task log, I've identified **three root causes** of the repeated edit corruption:

| Issue | Description | Evidence from Logs |
|-------|-------------|-------------------|
| **Search results lack line numbers** | `search` and `wildcard_search` return full file content but no line numbers, forcing the agent to manually count lines | Agent said "search found the files but didn't show the specific line numbers" |
| **Multi-edit line drift** | When making multiple `edit_lines` in one iteration, subsequent edits target wrong lines because line numbers shift after each edit | Agent hit line 176 when it should have hit line 194 |
| **No edit verification feedback** | Agent doesn't see what actually changed, so it can't detect corruption early | Agent had to discard and retry multiple times |

---

### Solution Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                     ENHANCED SEARCH                              │
│   search/wildcard_search now returns:                           │
│   - File path, id                                               │
│   - Line numbers with matching content                          │
│   - Context (lines before/after)                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                ENHANCED EDIT_LINES VERIFICATION                  │
│   After each edit, agent receives:                              │
│   - Original lines replaced (with numbers)                      │
│   - New lines inserted (with numbers)                           │
│   - 2 lines of surrounding context                              │
│   - Total line count change                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼  
┌─────────────────────────────────────────────────────────────────┐
│                PROMPT REINFORCEMENT                              │
│   Add critical rules to prompt template:                        │
│   - "Always read_file before editing to get current line #s"    │
│   - "One edit per file per iteration when unsure of lines"      │
│   - "Verify edit context before marking complete"               │
└─────────────────────────────────────────────────────────────────┘
```

---

### Implementation Details

#### 1. Enhance Search Results with Line Numbers

**File: `supabase/functions/coding-agent-orchestrator/index.ts`**

Post-process search results to extract line numbers:

```typescript
case "search":
  result = await supabase.rpc("search_file_content_with_token", {
    p_repo_id: repoId,
    p_search_term: op.params.keyword,
    p_token: shareToken,
  });
  
  // Enhance results with line numbers
  if (result.data && Array.isArray(result.data)) {
    result.data = result.data.map((file: any) => {
      const lines = file.content.split('\n');
      const matches: Array<{line: number, content: string}> = [];
      const keyword = op.params.keyword.toLowerCase();
      
      lines.forEach((line: string, idx: number) => {
        if (line.toLowerCase().includes(keyword)) {
          matches.push({ 
            line: idx + 1, 
            content: line.trim().slice(0, 200) 
          });
        }
      });
      
      return {
        id: file.id,
        path: file.path,
        match_count: file.match_count,
        matches: matches.slice(0, 20), // Limit to 20 matches per file
      };
    });
  }
  break;
```

Do the same for `wildcard_search`.

#### 2. Enhance edit_lines Verification Response

**File: `supabase/functions/coding-agent-orchestrator/index.ts`**

Return detailed verification object after edit:

```typescript
// After successful edit_lines (around line 1541)
if (!result.error && result.data?.[0]) {
  sessionFileRegistry.set(fileData.path, {
    staging_id: result.data[0].id,
    path: fileData.path,
    content: newContent,
    created_at: new Date(),
  });
  
  // Add verification details
  const newLines = newContent.split('\n');
  const oldLines = baseContent.split('\n');
  const lineDelta = newLines.length - oldLines.length;
  
  result.data[0].verification = {
    start_line: op.params.start_line,
    end_line: op.params.end_line,
    lines_replaced: endIdx >= startIdx ? (endIdx - startIdx + 1) : 0,
    lines_inserted: newContentLines.length,
    line_delta: lineDelta,
    before_context: newLines[startIdx - 2] ? `<<${startIdx - 1}>>${newLines[startIdx - 2]}` : null,
    edited_preview: newContentLines.slice(0, 3).map((l: string, i: number) => 
      `<<${startIdx + i + 1}>>${l}`
    ),
    after_context: newLines[startIdx + newContentLines.length] ? 
      `<<${startIdx + newContentLines.length + 1}>>${newLines[startIdx + newContentLines.length]}` : null,
    total_lines: newLines.length,
  };
}
```

#### 3. Update Operation Summary for Search/Edit

**File: `supabase/functions/coding-agent-orchestrator/index.ts`** (around line 1893)

```typescript
case "search":
  summary.summary = `Found ${Array.isArray(r.data) ? r.data.length : 0} files with matches`;
  if (Array.isArray(r.data)) {
    summary.results = r.data.map((f: any) => ({ 
      id: f.id, 
      path: f.path,
      match_count: f.match_count,
      matches: f.matches, // Line numbers + content
    }));
  }
  break;

case "edit_lines":
  if (r.data?.[0]?.verification) {
    const v = r.data[0].verification;
    summary.verification = v;
    summary.summary = `Edited lines ${v.start_line}-${v.end_line}, ` +
      `replaced ${v.lines_replaced} with ${v.lines_inserted} lines, ` +
      `file now ${v.total_lines} lines`;
  } else {
    summary.summary = `Edited file`;
  }
  break;
```

#### 4. Add Prompt Guidance for Safe Editing

**File: `public/data/codingAgentPromptTemplate.json`**

Add a new section after "Operation Batching" (order 8.5 → 9, shift others):

```json
{
  "id": "edit_safety",
  "title": "Edit Safety Guidelines",
  "type": "static",
  "editable": "editable",
  "order": 9,
  "description": "Guidelines for avoiding edit corruption",
  "variables": [],
  "content": "=== EDIT SAFETY GUIDELINES ===\n\nCRITICAL: To avoid corrupting files during edits:\n\n1. ALWAYS read_file IMMEDIATELY before edit_lines:\n   - Line numbers can shift between iterations\n   - Never rely on cached/remembered line numbers\n   - Use the <<N>> prefix to get exact line numbers\n\n2. SEARCH RESULTS INCLUDE LINE NUMBERS:\n   - search and wildcard_search now return matches with line numbers\n   - Use these to navigate directly to the right lines\n   - Still call read_file for surrounding context before editing\n\n3. VERIFY AFTER EDITING:\n   - Each edit_lines returns a verification object with:\n     - Lines replaced and inserted\n     - Preview of edited content with line numbers\n     - Surrounding context\n   - Check this verification before making more edits\n\n4. MULTI-EDIT STRATEGY:\n   - If making multiple edits to ONE file, edit from BOTTOM to TOP\n   - Edits at higher line numbers first, then lower line numbers\n   - This prevents line drift from affecting subsequent edits\n   - Example: If editing lines 100, 50, and 10 - order should be 100, 50, 10"
}
```

#### 5. Update Tools Manifest Descriptions

**File: `public/data/codingAgentToolsManifest.json`**

Update search tool descriptions:

```json
"search": {
  "description": "Search file paths and content by single keyword. Returns files with line numbers of matching content. Use the line numbers to navigate with read_file before editing.",
  ...
}

"wildcard_search": {
  "description": "Multi-term search across all files. Returns ranked results with line numbers showing where matches occur. Use these line numbers to find the exact locations to edit.",
  ...
}
```

---

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/coding-agent-orchestrator/index.ts` | Enhance search results with line numbers; add verification details to edit_lines; update operation summaries |
| `public/data/codingAgentPromptTemplate.json` | Add new "Edit Safety Guidelines" section |
| `public/data/codingAgentToolsManifest.json` | Update search/wildcard_search descriptions to mention line numbers |

---

### Expected Outcomes

After implementation:

1. **Agent can find exact line numbers from search** - No more manual counting
2. **Agent sees verification of each edit** - Can detect corruption immediately
3. **Prompt guides safer editing patterns** - Bottom-to-top, always read first
4. **Clearer operation summaries** - Agent understands what changed

---

### Testing Scenarios

| Scenario | Expected Behavior |
|----------|------------------|
| Search for pattern | Returns file paths + line numbers with matches |
| Edit single line | Verification shows exactly what was replaced |
| Multiple edits same file | Edits sorted bottom-to-top, no drift |
| Agent detects corruption | Re-reads file and adjusts line numbers |

