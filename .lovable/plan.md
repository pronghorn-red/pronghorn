

# Fix: IP Allow List Updates for Existing Render Databases

## Problem Summary

When editing an existing Render database, changing the IP allow list (e.g., clicking "Allow Any IP") saves to the local database but **does not update Render**. This is because:

1. **Frontend issue**: Only calls `render-database` edge function when the plan changes
2. **Backend issue**: The `updateRenderDatabase` function doesn't include `ipAllowList` in the PATCH request

## Solution

### Part 1: Update Edge Function to Accept and Send ipAllowList

**File**: `supabase/functions/render-database/index.ts`

**Changes**:
1. Add `ipAllowList` to the `RenderDatabaseRequest` interface
2. Update `updateRenderDatabase` function to include `ipAllowList` in the PATCH payload
3. The database record already has the updated `ip_allow_list` from the local save, so we can read it from there

```typescript
// Update interface (around line 10)
interface RenderDatabaseRequest {
  action: 'create' | 'status' | 'update' | 'delete' | 'suspend' | 'resume' | 'restart' | 'connectionInfo';
  databaseId: string;
  shareToken?: string;
  plan?: string;
  version?: string;
  region?: string;
  ipAllowList?: Array<{ cidrBlock: string; description: string }>; // ADD THIS
}

// Update the updateRenderDatabase function (lines 222-260)
async function updateRenderDatabase(
  database: any,
  body: RenderDatabaseRequest,
  headers: Record<string, string>,
  supabase: any,
  shareToken?: string
) {
  if (!database.render_postgres_id) {
    throw new Error("Database not yet created on Render");
  }

  const updatePayload: any = {};
  
  // Include plan if provided
  if (body.plan) {
    updatePayload.plan = body.plan;
  }
  
  // Include ipAllowList - use from body if provided, otherwise from database record
  if (body.ipAllowList !== undefined) {
    updatePayload.ipAllowList = body.ipAllowList;
  } else if (database.ip_allow_list && Array.isArray(database.ip_allow_list)) {
    updatePayload.ipAllowList = database.ip_allow_list;
  }

  // Only call Render API if there's something to update
  if (Object.keys(updatePayload).length === 0) {
    return { message: "No changes to sync to Render" };
  }

  console.log("[render-database] Update payload:", JSON.stringify(updatePayload));

  const response = await fetch(`${RENDER_API_URL}/postgres/${database.render_postgres_id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(updatePayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update database: ${errorText}`);
  }

  const renderData = await response.json();

  // Update local record status if plan changed
  if (body.plan) {
    await supabase.rpc("update_database_with_token", {
      p_database_id: database.id,
      p_token: shareToken || null,
      p_plan: body.plan,
      p_status: "updating",
    });
  }

  return renderData;
}
```

---

### Part 2: Update Frontend to Trigger Render Sync for IP Changes

**File**: `src/components/deploy/DatabaseDialog.tsx`

**Changes**: Modify the edit logic (around lines 234-254) to also trigger a Render sync when the IP allow list changes

```typescript
// After saving to local database (line 233), check if Render sync is needed
if (database.render_postgres_id) {
  const planChanged = form.plan !== database.plan;
  const ipListChanged = JSON.stringify(finalIpAllowList) !== JSON.stringify(database.ip_allow_list || []);
  
  if (planChanged || ipListChanged) {
    const { error: renderError } = await supabase.functions.invoke("render-database", {
      body: {
        action: "update",
        databaseId: database.id,
        shareToken,
        plan: planChanged ? form.plan : undefined,
        ipAllowList: ipListChanged ? finalIpAllowList : undefined,
      },
    });

    if (renderError) {
      toast.warning("Saved locally, but failed to sync to Render");
    } else {
      toast.success("Database updated and synced to Render");
    }
  } else {
    toast.success("Database configuration updated");
  }
} else {
  toast.success("Database configuration updated");
}
```

---

## Implementation Summary

| File | Change |
|------|--------|
| `supabase/functions/render-database/index.ts` | Add `ipAllowList` to interface and PATCH payload |
| `src/components/deploy/DatabaseDialog.tsx` | Trigger Render sync when IP allow list changes |

## Expected Behavior After Fix

1. User edits existing Render database
2. User clicks "Allow Any IP" toggle
3. User clicks Save
4. **Local database** saves with new `ip_allow_list` ✓
5. **Render API** receives PATCH with `ipAllowList` ✓
6. Render updates the database networking rules ✓

