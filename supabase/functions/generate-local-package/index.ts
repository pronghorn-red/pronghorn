import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeneratePackageRequest {
  deploymentId: string;
  shareToken?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    const body: GeneratePackageRequest = await req.json();
    const { deploymentId, shareToken } = body;

    console.log(`[generate-local-package] DeploymentId: ${deploymentId}, shareToken: ${shareToken ? 'provided' : 'null'}`);

    // Validate access and get deployment details
    const { data: deployment, error: deploymentError } = await supabase.rpc(
      'get_deployment_with_secrets_with_token',
      { p_deployment_id: deploymentId, p_token: shareToken || null }
    );

    if (deploymentError) {
      console.error('[generate-local-package] Deployment fetch error:', deploymentError);
      throw new Error(deploymentError.message);
    }

    if (!deployment) {
      throw new Error('Deployment not found or access denied');
    }

    // Get repo details - prefer deployment.repo_id, fallback to Prime repo
    let repo = null;
    if (deployment.repo_id) {
      const { data: repoData } = await supabase.rpc('get_repo_by_id_with_token', {
        p_repo_id: deployment.repo_id,
        p_token: shareToken || null,
      });
      repo = repoData;
    } else {
      // Find Prime repo (or default, or first available) for the project
      const { data: repos, error: reposError } = await supabase.rpc('get_project_repos_with_token', {
        p_project_id: deployment.project_id,
        p_token: shareToken || null,
      });
      console.log(`[generate-local-package] get_repos_with_token result: ${repos?.length ?? 0} repos, error: ${reposError?.message || 'none'}`);
      repo = repos?.find((r: any) => r.is_prime) || repos?.find((r: any) => r.is_default) || repos?.[0];
      console.log(`[generate-local-package] No repo_id on deployment, found Prime repo: ${repo?.id}`);
    }

    // Get project details
    const { data: project } = await supabase.rpc('get_project_with_token', {
      p_project_id: deployment.project_id,
      p_token: shareToken || null,
    });

    // Create ZIP file
    const zip = new JSZip();

    // 1. Create .env file with real-time config
    const envContent = generateEnvFile(deployment, shareToken, repo, SUPABASE_URL, SUPABASE_ANON_KEY);
    zip.file('.env', envContent);

    // 2. Create package.json with Supabase client for real-time
    const packageJson = generatePackageJson(deployment);
    zip.file('package.json', JSON.stringify(packageJson, null, 2));

    // 3. Create the new real-time runner script
    const runnerScript = generateRunnerScript(deployment, repo);
    zip.file('pronghorn-runner.js', runnerScript);

    // 4. Create README.md
    const readme = generateReadme(deployment, project, repo);
    zip.file('README.md', readme);

    // 5. Create start scripts
    const startScriptBash = `#!/bin/bash
npm install
node pronghorn-runner.js
`;
    zip.file('start.sh', startScriptBash);

    const startScriptWindows = `@echo off
npm install
node pronghorn-runner.js
`;
    zip.file('start.bat', startScriptWindows);

    // Generate the ZIP as base64
    const zipContent = await zip.generateAsync({ type: 'base64' });

    console.log('[generate-local-package] Package generated successfully');

    return new Response(JSON.stringify({ 
      success: true, 
      data: zipContent,
      filename: `${deployment.environment}-${deployment.name}-local.zip`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[generate-local-package] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generateEnvFile(deployment: any, shareToken: string | undefined, repo: any, supabaseUrl: string, supabaseAnonKey: string): string {
  const lines = [
    '# Pronghorn Real-Time Local Development Configuration',
    `# Generated for: ${deployment.name}`,
    `# Environment: ${deployment.environment}`,
    '',
    '# ===========================================',
    '# REBUILD TRIGGERS (set which events trigger rebuilds)',
    '# ===========================================',
    '# REBUILD_ON_STAGING: Rebuild when files are staged (immediate, before commit)',
    '# REBUILD_ON_FILES: Rebuild when files are committed (after commit)',
    '# REBUILD_ON_GIT: Rebuild when GitHub repo changes (requires PAT)',
    '',
    'REBUILD_ON_STAGING=true',
    'REBUILD_ON_FILES=true',
    'REBUILD_ON_GIT=false',
    '',
    '# ===========================================',
    '# GIT CONFIGURATION (only if REBUILD_ON_GIT=true)',
    '# ===========================================',
    repo ? `# GITHUB_REPO=${repo.organization}/${repo.repo}` : '# GITHUB_REPO=org/repo',
    `# GITHUB_BRANCH=${deployment.branch || 'main'}`,
    '# GITHUB_PAT=your_personal_access_token',
    '',
    '# ===========================================',
    '# SUPABASE / PRONGHORN CONFIGURATION',
    '# ===========================================',
    `SUPABASE_URL=${supabaseUrl}`,
    `SUPABASE_ANON_KEY=${supabaseAnonKey}`,
    `PRONGHORN_PROJECT_ID=${deployment.project_id}`,
    repo ? `PRONGHORN_REPO_ID=${repo.id}` : '# PRONGHORN_REPO_ID=<repo-uuid>',
    `PRONGHORN_DEPLOYMENT_ID=${deployment.id}`,
    shareToken ? `PRONGHORN_SHARE_TOKEN=${shareToken}` : '# PRONGHORN_SHARE_TOKEN=<your-token>',
    '',
    '# ===========================================',
    '# APPLICATION CONFIGURATION',
    '# ===========================================',
    `APP_ENVIRONMENT=${deployment.environment}`,
    'APP_PORT=3000',
    `PROJECT_TYPE=${deployment.project_type || 'node'}`,
    '',
    '# ===========================================',
    '# USER ENVIRONMENT VARIABLES',
    '# ===========================================',
  ];

  // Add user-defined env vars
  const envVars = deployment.env_vars || {};
  Object.entries(envVars).forEach(([key, value]) => {
    lines.push(`${key}=${value}`);
  });

  // Add secrets (redacted - user must fill in)
  const secrets = deployment.secrets || {};
  if (Object.keys(secrets).length > 0) {
    lines.push('');
    lines.push('# Secrets (fill in your values)');
    Object.keys(secrets).forEach((key) => {
      lines.push(`# ${key}=<your-secret-value>`);
    });
  }

  return lines.join('\n');
}

function generatePackageJson(deployment: any): object {
  return {
    name: `${deployment.environment}-${deployment.name}-local`,
    version: '1.0.0',
    description: `Pronghorn Real-Time Local Development Runner for ${deployment.name}`,
    main: 'pronghorn-runner.js',
    scripts: {
      start: 'node pronghorn-runner.js',
    },
    dependencies: {
      '@supabase/supabase-js': '^2.45.0',
      'dotenv': '^16.3.1',
      'node-fetch': '^3.3.2',
    },
  };
}

function generateRunnerScript(deployment: any, repo: any): string {
  const repoUrl = repo ? `https://github.com/${repo.organization}/${repo.repo}.git` : '';
  
  return `#!/usr/bin/env node
/**
 * Pronghorn Real-Time Local Development Runner
 * 
 * This script:
 * 1. Connects to Supabase Realtime to watch for file changes
 * 2. Pulls files from repo_files/repo_staging directly from database
 * 3. Writes files to ./app/ folder
 * 4. Runs npm run dev (Vite) or nodemon for hot reload
 * 5. Captures errors and sends telemetry back to Pronghorn
 */

require('dotenv').config();
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Dynamic import for ESM modules
let supabase = null;

const CONFIG = {
  // Rebuild triggers
  rebuildOnStaging: process.env.REBUILD_ON_STAGING === 'true',
  rebuildOnFiles: process.env.REBUILD_ON_FILES === 'true',
  rebuildOnGit: process.env.REBUILD_ON_GIT === 'true',
  
  // Git config (for REBUILD_ON_GIT)
  githubRepo: process.env.GITHUB_REPO,
  githubBranch: process.env.GITHUB_BRANCH || '${deployment.branch || 'main'}',
  githubPat: process.env.GITHUB_PAT,
  
  // Supabase config
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  
  // Pronghorn config
  projectId: process.env.PRONGHORN_PROJECT_ID,
  repoId: process.env.PRONGHORN_REPO_ID,
  deploymentId: process.env.PRONGHORN_DEPLOYMENT_ID,
  shareToken: process.env.PRONGHORN_SHARE_TOKEN,
  
  // App config
  projectType: process.env.PROJECT_TYPE || '${deployment.project_type || 'node'}',
  runCommand: '${deployment.run_command || 'npm run dev'}',
  buildCommand: '${deployment.build_command || 'npm run build'}',
  runFolder: '${deployment.run_folder || '/'}',
};

const APP_DIR = path.join(process.cwd(), 'app');
let devProcess = null;
let isRestarting = false;

// ============================================
// SUPABASE CLIENT INITIALIZATION
// ============================================

async function initSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  console.log('[Pronghorn] Supabase client initialized');
}

// ============================================
// TELEMETRY & ERROR REPORTING
// ============================================

async function reportLog(logType, message, stackTrace = null, filePath = null, lineNumber = null) {
  if (!CONFIG.supabaseUrl || !CONFIG.deploymentId) {
    console.error('[Pronghorn] Cannot report log - missing configuration');
    return;
  }

  try {
    const fetch = (await import('node-fetch')).default;
    await fetch(\`\${CONFIG.supabaseUrl}/functions/v1/report-local-issue\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deploymentId: CONFIG.deploymentId,
        shareToken: CONFIG.shareToken,
        logType,
        message: message.slice(0, 5000),
        stackTrace: stackTrace?.slice(0, 20000),
        filePath,
        lineNumber,
      }),
    });
    console.log(\`[Pronghorn] \${logType} log reported\`);
  } catch (err) {
    console.error('[Pronghorn] Failed to report log:', err.message);
  }
}

function parseErrorOutput(output) {
  const patterns = [
    /at\\s+(?:.*\\s+)?\\(?([^:]+):(\\d+):(\\d+)\\)?/,
    /([^(\\s]+)\\((\\d+),(\\d+)\\)/,
    /^([^:]+):(\\d+):(\\d+)/m,
    /File:\\s*([^\\n]+).*Line:\\s*(\\d+)/is,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return { filePath: match[1], lineNumber: parseInt(match[2], 10) };
    }
  }
  return { filePath: null, lineNumber: null };
}

// ============================================
// FILE SYNC FROM DATABASE
// ============================================

async function fetchAllFiles() {
  console.log('[Pronghorn] Fetching all files from database...');
  
  const files = [];
  
  // Fetch committed files
  if (CONFIG.rebuildOnFiles || CONFIG.rebuildOnStaging) {
    const { data: repoFiles, error: filesError } = await supabase.rpc('get_repo_files_with_token', {
      p_repo_id: CONFIG.repoId,
      p_token: CONFIG.shareToken || null,
    });
    
    if (filesError) {
      console.error('[Pronghorn] Error fetching repo files:', filesError.message);
    } else if (repoFiles) {
      repoFiles.forEach(f => {
        if (!f.is_binary) {
          files.push({ path: f.path, content: f.content, source: 'files' });
        }
      });
    }
  }
  
  // Fetch staged files (overwrite committed if staging enabled)
  if (CONFIG.rebuildOnStaging) {
    const { data: stagedFiles, error: stagingError } = await supabase.rpc('get_staging_with_token', {
      p_repo_id: CONFIG.repoId,
      p_token: CONFIG.shareToken || null,
    });
    
    if (stagingError) {
      console.error('[Pronghorn] Error fetching staging:', stagingError.message);
    } else if (stagedFiles) {
      stagedFiles.forEach(f => {
        if (f.operation_type === 'delete') {
          // Mark for deletion
          const idx = files.findIndex(existing => existing.path === f.file_path);
          if (idx >= 0) files.splice(idx, 1);
        } else if (!f.is_binary) {
          // Add or replace
          const idx = files.findIndex(existing => existing.path === f.file_path);
          if (idx >= 0) {
            files[idx] = { path: f.file_path, content: f.new_content, source: 'staging' };
          } else {
            files.push({ path: f.file_path, content: f.new_content, source: 'staging' });
          }
        }
      });
    }
  }
  
  console.log(\`[Pronghorn] Fetched \${files.length} files\`);
  return files;
}

async function writeFilesToDisk(files) {
  console.log('[Pronghorn] Writing files to ./app/ ...');
  
  // Ensure app directory exists
  if (!fs.existsSync(APP_DIR)) {
    fs.mkdirSync(APP_DIR, { recursive: true });
  }
  
  const changedPackageJsonDirs = [];
  
  for (const file of files) {
    const filePath = path.join(APP_DIR, file.path);
    const dirPath = path.dirname(filePath);
    
    // Create directory if needed
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // Write file
    fs.writeFileSync(filePath, file.content || '', 'utf8');
    
    // Track package.json changes for npm install
    if (path.basename(file.path) === 'package.json') {
      changedPackageJsonDirs.push(dirPath);
    }
  }
  
  console.log(\`[Pronghorn] Wrote \${files.length} files to disk\`);
  return changedPackageJsonDirs;
}

async function runNpmInstallInDirs(dirs) {
  for (const dir of dirs) {
    console.log(\`[Pronghorn] Running npm install in \${dir}...\`);
    try {
      execSync('npm install', { cwd: dir, stdio: 'inherit' });
      console.log(\`[Pronghorn] npm install completed in \${dir}\`);
    } catch (err) {
      console.error(\`[Pronghorn] npm install failed in \${dir}:\`, err.message);
      await reportLog('error', \`npm install failed in \${dir}: \${err.message}\`);
    }
  }
}

// ============================================
// DEV SERVER MANAGEMENT
// ============================================

function startDevServer() {
  const cwd = path.join(APP_DIR, CONFIG.runFolder.replace(/^\\//, ''));
  
  // Check if package.json exists and install deps
  const packageJsonPath = path.join(cwd, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    console.log('[Pronghorn] Installing dependencies...');
    try {
      execSync('npm install', { cwd, stdio: 'inherit' });
    } catch (err) {
      console.error('[Pronghorn] npm install failed:', err.message);
      reportLog('error', \`npm install failed: \${err.message}\`);
    }
  }
  
  console.log('[Pronghorn] Starting dev server...');
  console.log(\`[Pronghorn] Command: \${CONFIG.runCommand}\`);
  console.log(\`[Pronghorn] Directory: \${cwd}\`);
  
  const [cmd, ...args] = CONFIG.runCommand.split(' ');
  devProcess = spawn(cmd, args, {
    cwd,
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  devProcess.stdout.on('data', (data) => {
    process.stdout.write(data);
  });

  devProcess.stderr.on('data', async (data) => {
    const text = data.toString();
    process.stderr.write(text);
    
    // Report errors
    if (text.includes('Error') || text.includes('error') || text.includes('ERROR')) {
      const errorInfo = parseErrorOutput(text);
      await reportLog('error', text.slice(0, 2000), text, errorInfo.filePath, errorInfo.lineNumber);
    }
  });

  devProcess.on('close', (code) => {
    console.log(\`[Pronghorn] Dev server exited with code \${code}\`);
    if (code !== 0 && !isRestarting) {
      reportLog('error', \`Dev server exited with code \${code}\`);
    }
    devProcess = null;
  });
}

function stopDevServer() {
  return new Promise((resolve) => {
    if (!devProcess) {
      resolve();
      return;
    }
    
    console.log('[Pronghorn] Stopping dev server...');
    isRestarting = true;
    
    devProcess.on('close', () => {
      isRestarting = false;
      resolve();
    });
    
    devProcess.kill('SIGTERM');
    
    // Force kill after 5 seconds
    setTimeout(() => {
      if (devProcess) {
        devProcess.kill('SIGKILL');
      }
      isRestarting = false;
      resolve();
    }, 5000);
  });
}

async function restartDevServer() {
  await stopDevServer();
  startDevServer();
}

// ============================================
// REALTIME SUBSCRIPTION
// ============================================

async function setupRealtimeSubscription() {
  console.log('[Pronghorn] Setting up real-time subscriptions...');
  
  const channelName = \`local-runner-\${CONFIG.repoId}\`;
  
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'repo_staging',
        filter: \`repo_id=eq.\${CONFIG.repoId}\`,
      },
      async (payload) => {
        if (!CONFIG.rebuildOnStaging) return;
        console.log('[Pronghorn] Staging change detected:', payload.eventType);
        await handleFileChange('staging');
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'repo_files',
        filter: \`repo_id=eq.\${CONFIG.repoId}\`,
      },
      async (payload) => {
        if (!CONFIG.rebuildOnFiles) return;
        console.log('[Pronghorn] File change detected:', payload.eventType);
        await handleFileChange('files');
      }
    )
    .subscribe((status) => {
      console.log(\`[Pronghorn] Realtime subscription: \${status}\`);
      if (status === 'SUBSCRIBED') {
        console.log('[Pronghorn] ✓ Listening for file changes...');
      }
    });
  
  return channel;
}

let debounceTimer = null;
async function handleFileChange(source) {
  // Debounce rapid changes
  if (debounceTimer) clearTimeout(debounceTimer);
  
  debounceTimer = setTimeout(async () => {
    console.log(\`[Pronghorn] Processing \${source} change...\`);
    
    try {
      // Fetch and write files
      const files = await fetchAllFiles();
      const changedPackageJsonDirs = await writeFilesToDisk(files);
      
      // If any package.json files changed, stop server, run npm install, restart
      if (changedPackageJsonDirs.length > 0) {
        console.log(\`[Pronghorn] package.json changed in \${changedPackageJsonDirs.length} location(s)\`);
        await stopDevServer();
        await runNpmInstallInDirs(changedPackageJsonDirs);
        startDevServer();
      } else if (CONFIG.projectType === 'node' || CONFIG.projectType === 'express') {
        // Node.js projects need restart for any file change
        await restartDevServer();
      } else {
        // Vite/webpack handle HMR automatically
        console.log('[Pronghorn] Files updated - HMR should refresh automatically');
      }
      
      await reportLog('info', \`Files synced from \${source} (\${files.length} files)\`);
    } catch (err) {
      console.error('[Pronghorn] Error handling file change:', err.message);
      await reportLog('error', \`Failed to sync files: \${err.message}\`);
    }
  }, 500);
}

// ============================================
// GIT POLLING (if REBUILD_ON_GIT enabled)
// ============================================

let lastCommitSha = null;

async function pollGitHub() {
  if (!CONFIG.rebuildOnGit || !CONFIG.githubRepo || !CONFIG.githubPat) {
    return;
  }
  
  try {
    const fetch = (await import('node-fetch')).default;
    const [owner, repo] = CONFIG.githubRepo.split('/');
    const url = \`https://api.github.com/repos/\${owner}/\${repo}/commits/\${CONFIG.githubBranch}\`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': \`token \${CONFIG.githubPat}\`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    
    if (!response.ok) {
      throw new Error(\`GitHub API error: \${response.status}\`);
    }
    
    const data = await response.json();
    
    if (lastCommitSha && lastCommitSha !== data.sha) {
      console.log(\`[Pronghorn] New GitHub commit detected: \${data.sha.slice(0, 7)}\`);
      // For Git mode, we'd need to pull from Git, not database
      // This is a placeholder - actual implementation would clone/pull
      await reportLog('info', \`GitHub commit detected: \${data.sha.slice(0, 7)}\`);
    }
    
    lastCommitSha = data.sha;
  } catch (err) {
    console.error('[Pronghorn] GitHub polling error:', err.message);
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     Pronghorn Real-Time Local Development Runner         ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(\`║  Deployment: \${CONFIG.deploymentId?.slice(0, 8) || 'N/A'}...                               ║\`);
  console.log(\`║  Project Type: \${CONFIG.projectType.padEnd(40)}   ║\`);
  console.log(\`║  Rebuild on Staging: \${CONFIG.rebuildOnStaging ? 'YES' : 'NO '}                              ║\`);
  console.log(\`║  Rebuild on Files: \${CONFIG.rebuildOnFiles ? 'YES' : 'NO '}                                ║\`);
  console.log(\`║  Rebuild on Git: \${CONFIG.rebuildOnGit ? 'YES' : 'NO '}                                  ║\`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  if (!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey) {
    console.error('[Pronghorn] Missing Supabase configuration in .env');
    process.exit(1);
  }
  
  if (!CONFIG.repoId) {
    console.error('[Pronghorn] Missing PRONGHORN_REPO_ID in .env');
    process.exit(1);
  }

  try {
    // Initialize Supabase
    await initSupabase();
    
    // Initial file sync
    console.log('[Pronghorn] Performing initial file sync...');
    const files = await fetchAllFiles();
    const packageJsonDirs = await writeFilesToDisk(files);
    
    // Run npm install in any directories with package.json on initial load
    if (packageJsonDirs.length > 0) {
      console.log(\`[Pronghorn] Found \${packageJsonDirs.length} package.json file(s), installing dependencies...\`);
      await runNpmInstallInDirs(packageJsonDirs);
    }
    
    await reportLog('info', \`Initial sync complete (\${files.length} files)\`);
    
    // Setup realtime subscription
    await setupRealtimeSubscription();
    
    // Start GitHub polling if enabled
    if (CONFIG.rebuildOnGit) {
      setInterval(pollGitHub, 30000); // Poll every 30 seconds
      pollGitHub(); // Initial poll
    }
    
    // Start dev server
    startDevServer();
    
  } catch (err) {
    console.error('[Pronghorn] Fatal error:', err.message);
    await reportLog('error', \`Fatal error: \${err.message}\`);
    process.exit(1);
  }

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\\n[Pronghorn] Shutting down...');
    await stopDevServer();
    await reportLog('info', 'Local runner stopped');
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await stopDevServer();
    process.exit(0);
  });
}

main();
`;
}

function generateReadme(deployment: any, project: any, repo: any): string {
  return `# ${deployment.environment.toUpperCase()}-${deployment.name} Real-Time Local Development

This package provides **real-time synchronization** with Pronghorn. Files are pulled directly from the database and automatically updated when changes occur.

## 🚀 Quick Start

### Windows
\`\`\`cmd
start.bat
\`\`\`

### Linux/Mac
\`\`\`bash
chmod +x start.sh
./start.sh
\`\`\`

### Or manually
\`\`\`bash
npm install
npm start
\`\`\`

## ⚙️ Configuration

Edit the \`.env\` file to configure behavior:

### Rebuild Triggers

| Variable | Default | Description |
|----------|---------|-------------|
| \`REBUILD_ON_STAGING\` | \`true\` | Sync when files are staged (before commit) |
| \`REBUILD_ON_FILES\` | \`true\` | Sync when files are committed |
| \`REBUILD_ON_GIT\` | \`false\` | Poll GitHub for changes (requires PAT) |

### Required Configuration

| Variable | Description |
|----------|-------------|
| \`PRONGHORN_SHARE_TOKEN\` | Your project access token |
| \`PRONGHORN_REPO_ID\` | Repository ID (auto-filled) |
| \`SUPABASE_URL\` | Supabase project URL (auto-filled) |
| \`SUPABASE_ANON_KEY\` | Supabase anonymous key (auto-filled) |

## 📁 How It Works

1. **Initial Sync**: Downloads all files from Pronghorn database to \`./app/\` folder
2. **Real-Time Subscription**: Listens for changes to \`repo_staging\` and \`repo_files\` tables
3. **Hot Reload**: When changes detected:
   - **Vite/React/Vue**: Files update, HMR automatically refreshes browser
   - **Node.js/Express**: Server restarts automatically
4. **Error Telemetry**: Errors are captured and sent back to Pronghorn for AI-assisted debugging

## 📊 Project Details

| Property | Value |
|----------|-------|
| Project | ${project?.name || 'Unknown'} |
| Environment | ${deployment.environment} |
| Project Type | ${deployment.project_type || 'node'} |
| Run Command | \`${deployment.run_command}\` |
| Build Command | \`${deployment.build_command || 'N/A'}\` |
${repo ? `| Repository | https://github.com/${repo.organization}/${repo.repo} |` : ''}

## 🔍 Troubleshooting

### "Cannot find module @supabase/supabase-js"
Run \`npm install\` in this directory.

### Files not syncing
1. Check that \`PRONGHORN_SHARE_TOKEN\` is set in \`.env\`
2. Ensure \`PRONGHORN_REPO_ID\` is correct
3. Check console for subscription errors

### Port already in use
Change the \`APP_PORT\` in your \`.env\` file.

### Errors not appearing in Pronghorn
Verify \`PRONGHORN_DEPLOYMENT_ID\` and \`PRONGHORN_SHARE_TOKEN\` are set.

---
Generated by Pronghorn.RED - Real-Time Development Platform
`;
}
