

## Plan: Auto-Inject Fresh File Content After Edits + Fix Grouping Bug

### Problem Summary

The agent keeps corrupting files because:

| Issue | Root Cause |
|-------|------------|
| **Stale file content in history** | `read_file` results with full file content are persisted to DB and loaded on every iteration. After `edit_lines`, the agent still sees the OLD content from a previous `read_file`. |
| **Agent skips re-reading** | Agent assumes the file content from history is current, so it uses stale line numbers. |
| **Grouping bug** | Edits using `path` instead of `file_id` all group under `undefined`, causing incorrect sort/overlap detection. |

### Solution

**After every `edit_lines`, automatically include the fresh file content in the operation result** so it overwrites any stale content in the agent's context.

---

### Implementation Details

#### Fix 1: Auto-Inject Fresh Content After edit_lines

**File: `supabase/functions/coding-agent-orchestrator/index.ts`**

In the `edit_lines` success block (around line 1586-1615), the `newContent` already exists. We just need to attach it to the result AND include it in the operation summary.

**Current edit_lines summary (lines 2011-2020):**
```typescript
case "edit_lines":
  if (r.data?.[0]?.verification) {
    const v = r.data[0].verification;
    summary.verification = v;
    summary.summary = `Edited lines ${v.start_line}-${v.end_line}, ...`;
  }
  break;
```

**Updated - also include fresh file content with line numbers:**
```typescript
case "edit_lines":
  if (r.data?.[0]?.verification) {
    const v = r.data[0].verification;
    summary.verification = v;
    summary.summary = `Edited lines ${v.start_line}-${v.end_line}, ` +
      `replaced ${v.lines_replaced} with ${v.lines_inserted} lines, ` +
      `file now ${v.total_lines} lines`;
  }
  // CRITICAL: Auto-attach fresh file content so agent doesn't use stale data
  if (r.data?.[0]?.fresh_content) {
    summary.path = r.data[0].path;
    summary.fresh_content = r.data[0].fresh_content;
    summary.total_lines = r.data[0].total_lines;
    summary.content_note = "FRESH FILE CONTENT (replaces any previous read_file for this path)";
  }
  break;
```

**In edit_lines success block (around line 1614), add fresh_content to result:**
```typescript
result.data[0].verification = { ... };
result.data[0].total_lines = newLines.length;
result.data[0].path = fileData.path;

// Attach fresh content with line numbers for next iteration
const numberedContent = newLines.map((l: string, i: number) => `<<${i + 1}>>${l}`).join('\n');
result.data[0].fresh_content = numberedContent;
```

---

#### Fix 2: Use Path for Grouping When file_id is Missing

**File: `supabase/functions/coding-agent-orchestrator/index.ts`** (Lines 1296-1302)

**Current (broken):**
```typescript
if (op.type === 'edit_lines') {
  const fileId = op.params.file_id;
  if (!editsByFile.has(fileId)) editsByFile.set(fileId, []);
  editsByFile.get(fileId)!.push(op);
}
```

**Fixed:**
```typescript
if (op.type === 'edit_lines') {
  // Use file_id if provided, otherwise use path as grouping key
  const groupKey = op.params.file_id || op.params.path || 'unknown';
  if (!editsByFile.has(groupKey)) editsByFile.set(groupKey, []);
  editsByFile.get(groupKey)!.push(op);
}
```

---

#### Fix 3: Add Same-File Grouping Logging

Add debug logging to verify edits are being grouped and sorted correctly:

```typescript
for (const [groupKey, edits] of editsByFile) {
  if (edits.length > 1) {
    console.log(`[EDIT SORT] Grouping ${edits.length} edits for: ${groupKey}`);
    console.log(`[EDIT SORT] Lines before sort: ${edits.map(e => e.params.start_line).join(', ')}`);
  }
  edits.sort((a, b) => b.params.start_line - a.params.start_line);
  if (edits.length > 1) {
    console.log(`[EDIT SORT] Lines after sort: ${edits.map(e => e.params.start_line).join(', ')}`);
  }
  // ... rest of overlap check
}
```

---

### Technical Details

#### Why This Fixes Stale Content

Before fix:
```
Iteration 1: Agent reads file.js → content stored in history with lines 1-200
Iteration 2: Agent edits lines 50-60 → file now has 210 lines
Iteration 3: Agent still sees old content (200 lines) from Iteration 1's read_file
           → Uses stale line numbers → CORRUPTION
```

After fix:
```
Iteration 1: Agent reads file.js → content stored in history with lines 1-200
Iteration 2: Agent edits lines 50-60 → edit_lines result includes FRESH content (210 lines)
Iteration 3: Agent sees fresh content from Iteration 2's edit_lines result
           → Uses correct line numbers → NO CORRUPTION
```

The fresh content in the `edit_lines` result effectively **supersedes** any previous `read_file` content for that path.

---

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/coding-agent-orchestrator/index.ts` | 1. Add `fresh_content` with line numbers to edit_lines result (line ~1614). 2. Include fresh_content in operation summary (line ~2011). 3. Fix grouping key to use path when file_id missing (line ~1297). 4. Add logging for multi-edit sorting. |

---

### Expected Outcomes

| Scenario | Before | After |
|----------|--------|-------|
| Agent edits file | Only sees old read_file content | Sees fresh content with correct line numbers |
| Multiple edits same iteration | Wrong grouping, may corrupt | Correct per-file grouping and bottom-to-top sorting |
| Agent lazy (skips read_file) | Uses stale content → corruption | Fresh content auto-provided → no corruption |

