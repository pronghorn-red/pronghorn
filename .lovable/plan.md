

# Fix: Schema DDL Download Not Responding to Click

## Problem

When right-clicking a schema node and selecting "Download Schema DDL (.sql)", nothing happens. Edge function logs confirm the `manage-database` function is never called with `get_table_definition`, meaning the click handler doesn't execute or silently fails before the network call.

## Root Cause Investigation

The full code path has been traced:

1. Schema node renders with `type="schema"`, `name={schema.name}`, `extra={schema}` (the full SchemaInfo object)
2. `'schema'` is in the `contextMenuTypes` array, so the context menu wrapper applies
3. The ContextMenuItem calls `onDownloadSchemaDDL?.(name, extra)` which maps to `handleDownloadSchemaDDL`
4. The handler does `schemaInfo?.tables || []` where `schemaInfo` is the `extra` (full SchemaInfo)
5. `SchemaInfo.tables` is `string[]` -- this is correct

The code structure is sound. The most likely issue is that the `handleDownloadSchemaDDL` function throws before reaching the edge function call, possibly because `schemaInfo` is structured differently at runtime than expected, or the function simply never gets invoked due to a Radix context menu event issue.

## Fix: Add Defensive Logging and Error Handling

### File: `src/components/deploy/DatabaseExplorer.tsx`

Add `console.log` statements to both DDL handlers for debugging, and add a defensive fallback for `tables` extraction:

**`handleDownloadTableDDL`** -- Add entry log:
```typescript
const handleDownloadTableDDL = async (schema: string, tableName: string) => {
  console.log('[DDL] handleDownloadTableDDL called:', { schema, tableName });
  try {
    // ... existing code
  }
};
```

**`handleDownloadSchemaDDL`** -- Add entry log and more robust table extraction:
```typescript
const handleDownloadSchemaDDL = async (schemaName: string, schemaInfo: any) => {
  console.log('[DDL] handleDownloadSchemaDDL called:', { schemaName, schemaInfo });
  
  // More robust table extraction - handle both array of strings and SchemaInfo object
  let tables: string[] = [];
  if (Array.isArray(schemaInfo?.tables)) {
    tables = schemaInfo.tables;
  } else if (Array.isArray(schemaInfo)) {
    tables = schemaInfo;
  }
  
  console.log('[DDL] Tables to fetch:', tables);
  
  if (tables.length === 0) {
    toast.error("No tables found in this schema");
    return;
  }
  // ... rest of existing logic
};
```

### File: `src/components/deploy/DatabaseTreeContextMenu.tsx`

Add a defensive log in the schema context menu onClick to confirm the handler is being called:

```typescript
{type === 'schema' && (
  <>
    <ContextMenuItem onClick={() => {
      console.log('[DDL] Schema menu item clicked:', { name, extra });
      onDownloadSchemaDDL?.(name, extra);
    }}>
```

## Changes Summary

| File | Change |
|------|--------|
| `src/components/deploy/DatabaseExplorer.tsx` | Add `console.log` to both DDL handlers; add defensive table extraction fallback |
| `src/components/deploy/DatabaseTreeContextMenu.tsx` | Add `console.log` to schema DDL menu item click handler |

## Expected Outcome

After these changes, right-clicking a schema and selecting "Download Schema DDL (.sql)" will either:
1. **Work correctly** -- downloads the `.sql` file
2. **Show visible debugging** -- console logs will reveal exactly where the chain breaks (menu click not firing, handler not receiving correct data, edge function error, etc.)

The console logs will be visible on the next attempt, allowing us to identify and fix the exact failure point.

