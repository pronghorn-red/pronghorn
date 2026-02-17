
# Fix: Pronghorn Runner SSL Certificate Verification Failure

## Problem

The pronghorn-runner fails to connect to `https://api.pronghorn.red` because Node.js cannot verify the SSL certificate for this custom Supabase domain. Every `fetch` call and WebSocket connection fails with `unable to verify the first certificate`. This breaks:

- All RPC calls (file sync, staging, project data)
- Realtime subscriptions (staging and files channels show `CHANNEL_ERROR`)
- Log reporting (`report-local-issue` edge function calls)

## Root Cause

`api.pronghorn.red` is a custom domain pointing to Supabase. The SSL certificate chain served by this domain is incomplete -- the intermediate certificate is missing, so Node.js's strict TLS verification rejects it. This is a known issue with some custom domain / CDN setups.

## Fix

Add `NODE_TLS_REJECT_UNAUTHORIZED=0` at the very top of the generated runner script, immediately after the `.run` config is loaded but before any network calls. This tells Node.js to skip strict certificate chain verification.

### Change in `supabase/functions/generate-local-package/index.ts`

Insert one line right after `loadRunConfig();` (after line 579):

```javascript
// Allow connections to custom domains with incomplete certificate chains
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
```

This is safe for the runner because:
- It only runs locally on the developer's machine
- It only connects to the known Pronghorn API endpoint
- The alternative (broken sync) is worse than relaxed TLS for local dev

### Additionally: Fix `node-fetch` calls with an HTTPS agent (belt-and-suspenders)

The `node-fetch` library sometimes ignores `NODE_TLS_REJECT_UNAUTHORIZED`. As a backup, update the `reportLog` and `pushLocalChangeToCloud` functions to pass a custom HTTPS agent:

Add a helper near the top of the runner script (after CONFIG):

```javascript
let httpsAgent = null;
async function getHttpsAgent() {
  if (!httpsAgent) {
    const https = await import('https');
    httpsAgent = new https.Agent({ rejectUnauthorized: false });
  }
  return httpsAgent;
}
```

Then in `reportLog` and `pushLocalChangeToCloud`, pass `agent: await getHttpsAgent()` to the `node-fetch` calls.

## Changes Summary

| Location in generated runner | Change |
|------------------------------|--------|
| After `loadRunConfig()` | Add `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` |
| After CONFIG block | Add `getHttpsAgent()` helper |
| `reportLog` function | Add `agent` option to `node-fetch` call |
| `pushLocalChangeToCloud` function | Add `agent` option to `node-fetch` call |

All changes are in the single file: `supabase/functions/generate-local-package/index.ts` (the runner template).

## Expected Result

After re-downloading the runner package, `npm start` will:
- Successfully connect to `https://api.pronghorn.red`
- Fetch files and staging data
- Establish realtime subscriptions (no more `CHANNEL_ERROR`)
- Report logs without SSL errors
