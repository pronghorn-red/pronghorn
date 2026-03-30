# Pronghorn — GitHub Copilot Instructions

## Project Overview

Pronghorn is an open-source, standards-first, agentic AI platform built by the **Government of Alberta, Ministry of Technology and Innovation**. It transforms unstructured requirements into production-ready code with complete traceability. The platform orchestrates multi-agent AI teams to design, build, and ship software autonomously.

**Live**: [https://pronghorn.red](https://pronghorn.red)

### Operating Modes

| Mode | Purpose |
|------|---------|
| **Design** | Visual specification building with React Flow canvas |
| **Audit** | Multi-agent cross-comparison between project datasets |
| **Build** | Autonomous code generation with real-time monitoring |
| **Present** | AI-generated presentations with blackboard reasoning |

---

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Framework** | React 18 + TypeScript + Vite |
| **Styling** | Tailwind CSS + shadcn/ui + CSS variables (dark/light mode) |
| **Routing** | React Router v6 with lazy loading and path-based token sharing |
| **State** | React Context + hooks, TanStack Query for server state |
| **Canvas** | ReactFlow for interactive node/edge diagrams |
| **Editor** | Monaco Editor (VS Code engine) |
| **Backend** | Supabase (PostgreSQL, Auth, Edge Functions, Realtime, Storage) |
| **Edge Functions** | 58 Deno serverless functions |
| **LLM Providers** | Google Gemini, Anthropic Claude, xAI Grok |
| **Build** | Vite with SWC, code splitting via `manualChunks` |
| **Path Alias** | `@/` → `src/` |

---

## Project Structure

```
pronghorn/
├── src/
│   ├── components/           # UI components organized by feature domain
│   │   ├── ui/               # shadcn/ui base components (Button, Dialog, etc.)
│   │   ├── canvas/           # React Flow canvas (nodes, palette, agents, layers)
│   │   ├── build/            # Coding agent interface & monitoring
│   │   ├── deploy/           # Database explorer, SQL editor, import wizard
│   │   ├── present/          # Presentation generator & slide layouts
│   │   ├── audit/            # Multi-agent audit (blackboard, tesseract, Venn)
│   │   ├── collaboration/    # Real-time document editing
│   │   ├── buildbook/        # Build Book templates
│   │   ├── gallery/          # Project gallery browser
│   │   ├── artifacts/        # File viewers (PDF, DOCX, Excel)
│   │   ├── repository/       # File tree, code editor, Git integration
│   │   ├── requirements/     # Requirements tree management
│   │   ├── standards/        # Standards library UI
│   │   ├── specifications/   # Specification document generation
│   │   ├── dashboard/        # Project cards, creation dialogs
│   │   ├── layout/           # Navigation, sidebar, header
│   │   ├── project/          # Token management, access level banners
│   │   ├── chat/             # AI chat interface
│   │   ├── auth/             # Login, signup, SSO components
│   │   ├── admin/            # Admin-only components
│   │   ├── superadmin/       # Super-admin management
│   │   ├── techstack/        # Tech stack configuration
│   │   ├── resources/        # Resource management
│   │   └── docs/             # Documentation components
│   │
│   ├── contexts/             # React Context providers
│   │   ├── AuthContext.tsx    # Auth state, SSO methods, session management
│   │   └── AdminContext.tsx   # Admin mode state
│   │
│   ├── hooks/                # Custom React hooks
│   │   ├── useShareToken.ts  # Token extraction, caching, URL masking
│   │   ├── useAuditPipeline.ts
│   │   ├── useRealtime*.ts   # Supabase realtime subscription hooks
│   │   ├── useInfinite*.ts   # Paginated data hooks
│   │   └── ...
│   │
│   ├── pages/                # Route-level page components
│   │   ├── Landing.tsx       # Marketing page
│   │   ├── Dashboard.tsx     # Project list
│   │   ├── Auth.tsx          # Login/signup/SSO
│   │   └── project/          # Project-scoped pages (Canvas, Build, Audit, etc.)
│   │
│   ├── integrations/
│   │   └── supabase/
│   │       ├── client.ts     # Supabase client singleton (typed with Database)
│   │       └── types.ts      # Auto-generated TypeScript types
│   │
│   ├── lib/                  # Utility modules
│   │   ├── utils.ts          # cn() utility (clsx + tailwind-merge)
│   │   ├── tokenCache.ts     # Two-tier token cache (Map + sessionStorage)
│   │   ├── connectionLogic.ts
│   │   ├── stagingOperations.ts
│   │   ├── sqlParser.ts
│   │   └── presentationPdfExport.ts
│   │
│   ├── styles/               # Additional CSS
│   ├── utils/                # Pure utility functions
│   ├── assets/               # Static assets
│   └── main.tsx              # Application entry point
│
├── supabase/
│   ├── functions/            # 58 Deno edge functions
│   ├── migrations/           # SQL migration files
│   └── config.toml           # Supabase local config
│
├── public/
│   ├── data/                 # JSON configuration for agents, layouts, styles
│   └── features/             # Feature documentation (markdown)
│
├── vite.config.ts            # Vite config with code splitting & PWA
├── tailwind.config.ts        # Tailwind with shadcn/ui theme tokens
├── components.json           # shadcn/ui configuration
├── tsconfig.app.json         # TypeScript config (ES2020, @/ alias)
└── playwright.config.ts      # E2E test configuration
```

---

## Coding Conventions & Best Practices

### General Rules

1. **TypeScript everywhere** — All frontend code is TypeScript (`.tsx`, `.ts`). No `.js` files.
2. **Path aliases** — Always use `@/` imports, never relative `../../` paths.
   ```typescript
   // ✅ Correct
   import { supabase } from "@/integrations/supabase/client";
   import { cn } from "@/lib/utils";
   import { Button } from "@/components/ui/button";

   // ❌ Wrong
   import { supabase } from "../../integrations/supabase/client";
   ```
3. **Named exports** — Prefer named exports for components and hooks. Default exports are acceptable for page components used with `React.lazy()`.
4. **Functional components only** — No class components. All components are functions.
5. **No `any` unless necessary** — Use proper TypeScript types. The project has `strict: false` and `noImplicitAny: false`, but prefer typed code.

### Component Patterns

- **Feature-based organization**: Components live in `src/components/<feature>/`, not by type.
- **shadcn/ui primitives**: Use components from `@/components/ui/` for all base UI elements.
- **`cn()` for class merging**: Always use the `cn()` utility from `@/lib/utils` for conditional Tailwind classes.
  ```tsx
  <div className={cn("flex items-center", isActive && "bg-primary text-white")} />
  ```
- **Lucide icons**: Use `lucide-react` for all icons.
  ```tsx
  import { Plus, Trash2, Settings } from "lucide-react";
  ```

### State Management

- **React Context** for global state (auth, admin mode). Pattern:
  ```typescript
  // 1. Define typed interface
  interface MyContextType { ... }
  // 2. Create context with undefined default
  const MyContext = createContext<MyContextType | undefined>(undefined);
  // 3. Export Provider component
  export function MyProvider({ children }) { ... }
  // 4. Export consumer hook with guard
  export function useMyContext() {
    const ctx = useContext(MyContext);
    if (!ctx) throw new Error("useMyContext must be within MyProvider");
    return ctx;
  }
  ```
- **TanStack Query** for server state and caching.
- **Local state** (`useState`, `useReducer`) for component-level UI state.
- **No Redux** — The project does not use Redux or Zustand.

### Hooks

- Custom hooks live in `src/hooks/`.
- Realtime hooks follow the `useRealtime*` naming convention.
- All Supabase realtime hooks use `useRef` for channel storage to avoid stale closures.
- Hooks that depend on token availability check `isTokenSet` before making RPC calls.

### Routing

- React Router v6 with `<Routes>` / `<Route>`.
- Heavy pages use `React.lazy()` + `<Suspense fallback={<PageLoader />}>`.
- Protected routes wrap elements in `<RequireSignupValidation>` via `withValidation()`.
- **URL pattern for token-shared access**: `/project/:projectId/<page>/t/:token`
- **Standard project URL**: `/project/:projectId/<page>`

### Styling

- **Tailwind CSS** with shadcn/ui semantic tokens (CSS variables).
- Theme tokens: `primary`, `secondary`, `destructive`, `muted`, `accent`, `popover`, `card` — each with `DEFAULT` and `foreground`.
- Dark mode via `class` strategy (`dark:` prefix).
- No inline styles or CSS modules. Use Tailwind utility classes exclusively.
- Container: centered, `2rem` padding, max `1400px`.

---

## Supabase Integration Patterns

### Client Import

Always import the singleton client:
```typescript
import { supabase } from "@/integrations/supabase/client";
```

### RPC Calls (Token-Based Access)

All data access goes through **SECURITY DEFINER** RPC functions with token validation. Never query tables directly — always use `supabase.rpc()`:

```typescript
const { token: shareToken, isTokenSet } = useShareToken(projectId);

// Wait for token readiness
if (!isTokenSet) return;

const { data, error } = await supabase.rpc('get_requirements_with_token', {
  p_project_id: projectId,
  p_token: shareToken || null  // null for authenticated owners
});
```

### Token Caching

Tokens are cached two-tier (in-memory `Map` + `sessionStorage`):
```typescript
import { getProjectToken, setProjectToken, clearProjectToken } from "@/lib/tokenCache";
```

### Realtime Subscriptions

Pattern for real-time data with Supabase:
```typescript
const channelRef = useRef<RealtimeChannel | null>(null);

useEffect(() => {
  channelRef.current = supabase
    .channel(`feature:${projectId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'my_table',
      filter: `project_id=eq.${projectId}`
    }, (payload) => {
      // Handle INSERT, UPDATE, DELETE
    })
    .on('broadcast', { event: 'refresh' }, () => {
      // Reload data
    })
    .subscribe();

  return () => {
    channelRef.current?.unsubscribe();
    channelRef.current = null;
  };
}, [projectId]);
```

Key rules:
- Always use `useRef` for channel storage.
- Store channel during subscription setup.
- Use `channelRef.current.send()` for broadcasting, NOT `supabase.channel().send()`.
- Clean up on unmount: unsubscribe and null the ref.
- Broadcast payloads carry **no sensitive data** — only refresh signals.

### Edge Function Invocation

```typescript
const { data, error } = await supabase.functions.invoke('my-function', {
  body: { projectId, shareToken, ...params }
});
```

For streaming responses (chat):
```typescript
const response = await supabase.functions.invoke('chat-stream-gemini', {
  body: { messages, model, projectId, shareToken }
});
// Handle SSE stream from response
```

---

## Edge Function Patterns (Deno)

All edge functions follow this structure:
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, shareToken, ...params } = await req.json();
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Validate access
    const { data: role } = await supabase.rpc('authorize_project_access', {
      p_project_id: projectId,
      p_token: shareToken || null
    });
    if (!role) throw new Error('Access denied');

    // ... business logic ...

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
```

Key rules:
- Always handle CORS preflight (`OPTIONS`).
- Always validate access via `authorize_project_access` or `require_role` RPC.
- Use `SECURITY DEFINER` RPC for database operations.
- Pass the `Authorization` header from the incoming request to the Supabase client.
- Environment secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `GROK_API_KEY`, `GITHUB_PAT`, `RENDER_API_KEY`.

---

## Authentication & Authorization

### Auth Methods

- Email/Password, Google SSO, Microsoft Azure SSO, Anonymous (token-based).

### Role Hierarchy

| Role | Level | Permissions |
|------|-------|-------------|
| `owner` | 3 | Full access: manage tokens, delete project, all CRUD |
| `editor` | 2 | Create, read, update (no token management or deletion) |
| `viewer` | 1 | Read-only access |

### Authorization Pattern

```sql
-- Read ops require 'viewer' minimum
PERFORM require_role(p_project_id, p_token, 'viewer');
-- Write ops require 'editor' minimum
PERFORM require_role(p_project_id, p_token, 'editor');
-- Admin ops require 'owner'
PERFORM require_role(p_project_id, p_token, 'owner');
```

---

## AI Agent Architecture

### Multi-Agent Canvas Agents (10 agents)

Architect, Developer, DBA, Security, QA, DevOps, UX, API, Performance, Documentation — share a blackboard for iterative refinement with critic review.

### Specification Agents (13 types)

Overview, Technical Spec, Cloud Architecture, API Spec, Security Analysis, Data Requirements, Accessibility, i18n, DevOps, Testing, Standards Compliance, Executive Summary, Project Charter.

### Audit Agents (5 perspectives)

Security Analyst, Business Analyst, Developer, End User, Architect — multi-perspective cross-comparison with consensus voting.

### Coding Agent

Autonomous file operations: read, edit, create, delete, rename with full Git workflow (staging → commit → push).

### LLM Providers

| Provider | Models |
|----------|--------|
| Google Gemini | gemini-2.5-flash, gemini-2.5-pro |
| Anthropic Claude | claude-opus-4-5 |
| xAI Grok | grok-4-1-fast-reasoning, grok-4-1-fast-non-reasoning |

---

## Database Conventions

### SQL RPC Functions

- All functions are `SECURITY DEFINER` with `SET search_path TO 'public'`.
- Parameter prefix: `p_` for inputs, `v_` for local variables.
- Return types: `RETURNS SETOF <table>` for queries, `RETURNS <table>` for single row.
- Always validate access as the first operation.

### Schema Naming

- Tables: `snake_case` plural (`canvas_nodes`, `project_tokens`).
- Enums: `snake_case` (`project_token_role`, `requirement_type`).
- Functions: `snake_case` with `_with_token` suffix for token-validated variants.
- Indexes and constraints follow PostgreSQL conventions.

---

## Key Data Files (public/data/)

| File | Purpose |
|------|---------|
| `agents.json` | Specification agent definitions (13 types) |
| `buildAgents.json` | Canvas multi-agent definitions (10 agents) |
| `connectionLogic.json` | Canvas edge validation rules |
| `graphicStyles.json` | Image generation styles |
| `presentAgentInstructions.json` | Presentation blackboard spec |
| `presentationLayouts.json` | 15 slide layouts + themes |
| `auditAgentInstructions.json` | Audit orchestrator spec |
| `codingAgentInstructions.json` | Coding agent tools & patterns |
| `collaborationAgentInstructions.json` | Document collaboration agent |
| `deploymentSettings.json` | Multi-runtime deploy configs |

---

## Common Pitfalls to Avoid

1. **Never bypass RPC** — Don't use `supabase.from('table').select()` for project data. Always use the `*_with_token` RPC functions.
2. **Don't forget `isTokenSet`** — Always check `isTokenSet` before making RPC calls in hooks/components that use `useShareToken`.
3. **Don't use `supabase.channel().send()`** — Use `channelRef.current.send()` for broadcasting on existing channels.
4. **Don't add CSS modules or inline styles** — Use Tailwind utilities and `cn()` exclusively.
5. **Don't import from `react-icons`** — Use `lucide-react` for all icons.
6. **Don't create new context without the guard pattern** — Always include the undefined check in consumer hooks.
7. **Don't skip CORS handling** in edge functions — Always handle `OPTIONS` preflight.
8. **Don't store sensitive data in broadcast payloads** — Broadcasts are public; only send refresh signals.
9. **Don't use relative imports** — Always use `@/` path alias.
10. **Don't lazy-load lightweight pages** — Only use `React.lazy()` for heavy pages with large dependencies (Monaco, ReactFlow, etc.).

---

## File Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Components | PascalCase `.tsx` | `SlideRenderer.tsx` |
| Hooks | camelCase with `use` prefix `.ts` | `useRealtimeCanvas.ts` |
| Utilities | camelCase `.ts` | `tokenCache.ts` |
| Pages | PascalCase `.tsx` | `Dashboard.tsx` |
| Context providers | PascalCase with `Context` suffix `.tsx` | `AuthContext.tsx` |
| Types | PascalCase in `types.ts` files | `Database` |
| Edge functions | kebab-case directory names | `coding-agent-orchestrator/` |
| SQL migrations | Timestamped `.sql` | `20240101000000_add_tokens.sql` |

---

## Testing

- **E2E**: Playwright configured in `playwright.config.ts` with custom fixtures in `playwright-fixture.ts`.
- Test files should follow Playwright conventions.
- No unit test framework is currently configured (no Jest/Vitest in package.json).

---

## Development Commands

```bash
npm run dev          # Start dev server on port 8080
npm run build        # Production build
npm run build:dev    # Development build
npm run lint         # ESLint
npm run preview      # Preview production build
```

---

## When Adding New Features

1. **Components** → Create in `src/components/<feature>/` directory.
2. **Pages** → Add to `src/pages/` (or `src/pages/project/` for project-scoped).
3. **Routes** → Register in `src/App.tsx` with proper lazy loading if heavy.
4. **Hooks** → Add to `src/hooks/` with `use` prefix.
5. **Supabase RPC** → Create `*_with_token` SQL function, add to `types.ts`.
6. **Edge functions** → New directory under `supabase/functions/` following the CORS + auth pattern.
7. **Agent configs** → Add JSON to `public/data/`.
8. **Realtime** → Create `useRealtime*` hook with channel ref pattern.
9. **UI Components** → Use `npx shadcn-ui@latest add <component>` for new base components.
