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
  mode?: 'full' | 'env-only'; // download mode
}

// Encryption helpers (must match deployment-secrets edge function)
const ENCRYPTION_KEY = Deno.env.get('SECRETS_ENCRYPTION_KEY');

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

async function decrypt(ciphertext: string): Promise<string> {
  if (!ENCRYPTION_KEY) {
    throw new Error('SECRETS_ENCRYPTION_KEY not configured');
  }
  
  const keyBytes = hexToBytes(ENCRYPTION_KEY);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  // Format: iv (12 bytes hex) + ciphertext (hex)
  const ivHex = ciphertext.slice(0, 24);
  const dataHex = ciphertext.slice(24);
  
  const iv = hexToBytes(ivHex);
  const data = hexToBytes(dataHex);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    data.buffer as ArrayBuffer
  );
  
  return new TextDecoder().decode(decrypted);
}

async function decryptEnvVars(encryptedEnvVars: string | null): Promise<Record<string, string>> {
  if (!encryptedEnvVars || !ENCRYPTION_KEY) {
    return {};
  }
  
  try {
    const decrypted = await decrypt(encryptedEnvVars);
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('[generate-local-package] Failed to decrypt env vars:', error);
    return {};
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    const body: GeneratePackageRequest = await req.json();
    const { deploymentId, shareToken, mode = 'full' } = body;

    console.log(`[generate-local-package] DeploymentId: ${deploymentId}, mode: ${mode}, shareToken: ${shareToken ? 'provided' : 'null'}`);

    // Validate access and get deployment details (requires owner access)
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

    // Decrypt env vars for local deployment package (owner already validated via RPC)
    const decryptedEnvVars = await decryptEnvVars(deployment.env_vars_encrypted);
    console.log(`[generate-local-package] Decrypted ${Object.keys(decryptedEnvVars).length} env vars`);

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

    // Generate the comprehensive .env file with decrypted values
    const envContent = generateEnvFile(deployment, shareToken, repo, SUPABASE_URL, SUPABASE_ANON_KEY, decryptedEnvVars);

    // ENV-ONLY MODE: Just return the .env content as text
    if (mode === 'env-only') {
      console.log('[generate-local-package] Returning .env file only');
      return new Response(JSON.stringify({ 
        success: true, 
        data: envContent,
        filename: '.env',
        contentType: 'text/plain'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // FULL MODE: Create ZIP file with runner + .env
    const zip = new JSZip();

    // 1. Create .env file with comprehensive runtime config
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

    // 5. Create .env.example as template
    zip.file('.env.example', generateEnvExample());

    // Generate the ZIP as base64
    const zipContent = await zip.generateAsync({ type: 'base64' });

    console.log('[generate-local-package] Full package generated successfully');

    return new Response(JSON.stringify({ 
      success: true, 
      data: zipContent,
      filename: `${deployment.environment}-${deployment.name}-local.zip`,
      contentType: 'application/zip'
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

function generateEnvFile(deployment: any, shareToken: string | undefined, repo: any, supabaseUrl: string, supabaseAnonKey: string, decryptedEnvVars: Record<string, string> = {}): string {
  const projectType = deployment.project_type || 'vue_vite';
  const isVite = isViteProject(projectType);
  
  // Determine commands based on project type
  const runCommand = isVite ? 'npm run dev' : (deployment.run_command || 'npm run dev');
  const buildCommand = isVite ? 'npm run build' : (deployment.build_command || '');
  const runFolder = isVite ? '/' : (deployment.run_folder || '/');
  const buildFolder = isVite ? 'dist' : (deployment.build_folder || 'dist');

  const lines = [
    '# =====================================================',
    '# Pronghorn Runner Configuration',
    `# Generated for: ${deployment.environment}-${deployment.name}`,
    `# Generated at: ${new Date().toISOString()}`,
    '# =====================================================',
    '',
    '# ===========================================',
    '# CORE IDENTIFICATION (REQUIRED)',
    '# ===========================================',
    `SUPABASE_URL=https://api.pronghorn.red`,
    `SUPABASE_ANON_KEY=${supabaseAnonKey}`,
    `PRONGHORN_PROJECT_ID=${deployment.project_id}`,
    repo ? `PRONGHORN_REPO_ID=${repo.id}` : '# PRONGHORN_REPO_ID=<repo-uuid>',
    `PRONGHORN_DEPLOYMENT_ID=${deployment.id}`,
    shareToken ? `PRONGHORN_SHARE_TOKEN=${shareToken}` : '# PRONGHORN_SHARE_TOKEN=<your-token>',
    '',
    '# ===========================================',
    '# RUNTIME CONFIGURATION',
    '# ===========================================',
    '# PROJECT_TYPE options: vue_vite, react_vite, static, node, python, go, ruby, rust, elixir, docker',
    `PROJECT_TYPE=${projectType}`,
    '',
    '# Active runtime settings (uncomment and modify as needed)',
    `RUN_COMMAND=${runCommand}`,
    buildCommand ? `BUILD_COMMAND=${buildCommand}` : '# BUILD_COMMAND=',
    `INSTALL_COMMAND=npm install`,
    `RUN_FOLDER=${runFolder}`,
    `BUILD_FOLDER=${buildFolder}`,
    '',
    '# ===========================================',
    '# VITE / REACT / VUE (Node.js based)',
    '# Uncomment these for Vite-based projects',
    '# ===========================================',
    '# PROJECT_TYPE=vue_vite',
    '# RUN_COMMAND=npm run dev',
    '# BUILD_COMMAND=npm run build',
    '# INSTALL_COMMAND=npm install',
    '# RUN_FOLDER=/',
    '# BUILD_FOLDER=dist',
    '',
    '# ===========================================',
    '# NODE.JS BACKEND',
    '# Uncomment these for Node.js/Express projects',
    '# ===========================================',
    '# PROJECT_TYPE=node',
    '# RUN_COMMAND=node index.js',
    '# BUILD_COMMAND=npm run build',
    '# INSTALL_COMMAND=npm install',
    '# RUN_FOLDER=/',
    '',
    '# ===========================================',
    '# PYTHON BACKEND',
    '# Uncomment these for Python projects',
    '# ===========================================',
    '# PROJECT_TYPE=python',
    '# RUN_COMMAND=python main.py',
    '# BUILD_COMMAND=',
    '# INSTALL_COMMAND=pip install -r requirements.txt',
    '# RUN_FOLDER=/',
    '',
    '# ===========================================',
    '# GO BACKEND',
    '# Uncomment these for Go projects',
    '# ===========================================',
    '# PROJECT_TYPE=go',
    '# RUN_COMMAND=./app',
    '# BUILD_COMMAND=go build -o app',
    '# INSTALL_COMMAND=go mod download',
    '# RUN_FOLDER=/',
    '',
    '# ===========================================',
    '# RUBY BACKEND',
    '# Uncomment these for Ruby projects',
    '# ===========================================',
    '# PROJECT_TYPE=ruby',
    '# RUN_COMMAND=bundle exec ruby app.rb',
    '# BUILD_COMMAND=',
    '# INSTALL_COMMAND=bundle install',
    '# RUN_FOLDER=/',
    '',
    '# ===========================================',
    '# RUST BACKEND',
    '# Uncomment these for Rust projects',
    '# ===========================================',
    '# PROJECT_TYPE=rust',
    '# RUN_COMMAND=./target/release/app',
    '# BUILD_COMMAND=cargo build --release',
    '# INSTALL_COMMAND=',
    '# RUN_FOLDER=/',
    '',
    '# ===========================================',
    '# ELIXIR BACKEND',
    '# Uncomment these for Elixir projects',
    '# ===========================================',
    '# PROJECT_TYPE=elixir',
    '# RUN_COMMAND=mix phx.server',
    '# BUILD_COMMAND=mix compile',
    '# INSTALL_COMMAND=mix deps.get',
    '# RUN_FOLDER=/',
    '',
    '# ===========================================',
    '# DOCKER',
    '# Uncomment these for Docker-based projects',
    '# ===========================================',
    '# PROJECT_TYPE=docker',
    '# RUN_COMMAND=docker-compose up',
    '# BUILD_COMMAND=docker build -t app .',
    '# INSTALL_COMMAND=',
    '# RUN_FOLDER=/',
    '',
    '# ===========================================',
    '# SYNC SETTINGS',
    '# ===========================================',
    '# REBUILD_ON_STAGING: Rebuild when files are staged (immediate, before commit)',
    '# REBUILD_ON_FILES: Rebuild when files are committed (after commit)',
    '',
    'REBUILD_ON_STAGING=true',
    'REBUILD_ON_FILES=true',
    '',
    '# PUSH_LOCAL_CHANGES: Push local file edits back to Pronghorn staging',
    'PUSH_LOCAL_CHANGES=true',
    '',
    '# ===========================================',
    '# PROJECT DATA SYNC',
    '# Exports requirements, canvas, artifacts, specs to local folder',
    '# One-directional: Cloud → Local (read-only export)',
    '# ===========================================',
    'SYNC_PROJECT_DATA=true',
    'PROJECT_SYNC_FOLDER=./project',
    '',
    '# ===========================================',
    '# APP SETTINGS',
    '# ===========================================',
    `APP_ENVIRONMENT=${deployment.environment}`,
    'APP_PORT=3000',
    '',
    '# ===========================================',
    '# USER ENVIRONMENT VARIABLES',
    '# Add your application-specific env vars below',
    '# ===========================================',
  ];

  // Add user-defined env vars with decrypted values (owner access already validated)
  const decryptedKeys = Object.keys(decryptedEnvVars);
  if (decryptedKeys.length > 0) {
    lines.push('# Your deployment environment variables (decrypted for local use)');
    decryptedKeys.forEach((key) => {
      const value = decryptedEnvVars[key] || '';
      // Quote values with special characters
      const needsQuotes = value.includes(' ') || value.includes('#') || value.includes('=');
      const quotedValue = needsQuotes ? `"${value}"` : value;
      lines.push(`${key}=${quotedValue}`);
    });
  } else {
    // Fallback: show keys only if no decrypted values available
    const envVars = deployment.env_vars || {};
    const envVarKeys = Object.keys(envVars);
    if (envVarKeys.length > 0) {
      lines.push('# These keys match your deployment configuration - add your local values');
      envVarKeys.forEach((key) => {
        lines.push(`${key}=`);
      });
    }
  }

  return lines.join('\n');
}

function generateEnvExample(): string {
  return `# =====================================================
# Pronghorn Runner Configuration Template
# Copy this to .env and fill in your values
# =====================================================

# ===========================================
# CORE IDENTIFICATION (REQUIRED)
# Get these from your Pronghorn deployment
# ===========================================
SUPABASE_URL=https://api.pronghorn.red
SUPABASE_ANON_KEY=your-anon-key
PRONGHORN_PROJECT_ID=your-project-uuid
PRONGHORN_REPO_ID=your-repo-uuid
PRONGHORN_DEPLOYMENT_ID=your-deployment-uuid
PRONGHORN_SHARE_TOKEN=your-share-token

# ===========================================
# RUNTIME CONFIGURATION
# ===========================================
# PROJECT_TYPE options: vue_vite, react_vite, static, node, python, go, ruby, rust, elixir, docker
PROJECT_TYPE=vue_vite
RUN_COMMAND=npm run dev
BUILD_COMMAND=npm run build
INSTALL_COMMAND=npm install
RUN_FOLDER=/
BUILD_FOLDER=dist

# ===========================================
# SYNC SETTINGS
# ===========================================
REBUILD_ON_STAGING=true
REBUILD_ON_FILES=true
PUSH_LOCAL_CHANGES=true

# ===========================================
# PROJECT DATA SYNC
# Exports requirements, canvas, artifacts, specs to ./project folder
# ===========================================
SYNC_PROJECT_DATA=true
PROJECT_SYNC_FOLDER=./project

# ===========================================
# APP SETTINGS
# ===========================================
APP_ENVIRONMENT=development
APP_PORT=3000
`;
}

function generatePackageJson(deployment: any): object {
  return {
    name: `pronghorn-runner-${deployment.environment}-${deployment.name}`,
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
      'chokidar': '^3.5.3',
      'ws': '^8.18.3',
    },
    engines: {
      node: '>=18.0.0'
    }
  };
}

function isViteProject(projectType: string | undefined): boolean {
  return projectType === 'vue_vite' || projectType === 'react_vite' || projectType === 'static';
}

function generateRunnerScript(deployment: any, repo: any): string {
  return `#!/usr/bin/env node
/**
 * Pronghorn Real-Time Local Development Runner
 * 
 * This script:
 * 1. Reads ALL configuration from .env file
 * 2. Connects to Supabase Realtime to watch for file changes
 * 3. Pulls files from repo_files/repo_staging directly from database
 * 4. Writes files to ./app/ folder
 * 5. Runs the configured dev command for your project type
 * 6. Captures errors and sends telemetry back to Pronghorn
 * 
 * Supports: Node.js, Python, Go, Ruby, Rust, Elixir, Docker
 */

require('dotenv').config();
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Dynamic import for ESM modules
let supabase = null;

// All configuration from .env
const CONFIG = {
  // Core identification
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  projectId: process.env.PRONGHORN_PROJECT_ID,
  repoId: process.env.PRONGHORN_REPO_ID,
  deploymentId: process.env.PRONGHORN_DEPLOYMENT_ID,
  shareToken: process.env.PRONGHORN_SHARE_TOKEN,
  
  // Runtime configuration (all from .env)
  projectType: process.env.PROJECT_TYPE || 'vue_vite',
  runCommand: process.env.RUN_COMMAND || 'npm run dev',
  buildCommand: process.env.BUILD_COMMAND || '',
  installCommand: process.env.INSTALL_COMMAND || 'npm install',
  runFolder: process.env.RUN_FOLDER || '/',
  buildFolder: process.env.BUILD_FOLDER || 'dist',
  
  // Sync settings
  rebuildOnStaging: process.env.REBUILD_ON_STAGING !== 'false',
  rebuildOnFiles: process.env.REBUILD_ON_FILES !== 'false',
  pushLocalChanges: process.env.PUSH_LOCAL_CHANGES !== 'false',
  
  // Project data sync
  syncProjectData: process.env.SYNC_PROJECT_DATA === 'true',
  projectSyncFolder: process.env.PROJECT_SYNC_FOLDER || './project',
  
  // App settings
  appEnvironment: process.env.APP_ENVIRONMENT || 'development',
  appPort: process.env.APP_PORT || '3000',
};

const APP_DIR = path.join(process.cwd(), 'app');
let devProcess = null;
let isRestarting = false;

// Track known staged files for detecting unstaging
let knownStagedFiles = new Map();

// Debounce timer for staging sync
let stagingSyncTimer = null;
const STAGING_DEBOUNCE_MS = 150;

// ============================================
// SUPABASE CLIENT INITIALIZATION
// ============================================

async function initSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  const { WebSocket } = await import('ws');
  
  supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
    realtime: {
      transport: WebSocket,
    },
  });
  console.log('[Pronghorn] Supabase client initialized with WebSocket support');
  
  // Set share token in session for RLS policies to work with postgres_changes
  // This must be called before setting up realtime subscriptions
  if (CONFIG.shareToken) {
    const { error } = await supabase.rpc('set_share_token', { token: CONFIG.shareToken });
    if (error) {
      console.warn('[Pronghorn] Failed to set share token in session:', error.message);
    } else {
      console.log('[Pronghorn] Share token set in session for RLS validation');
    }
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function hashContent(content) {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function isBinaryFile(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const checkLength = Math.min(buffer.length, 8192);
    for (let i = 0; i < checkLength; i++) {
      if (buffer[i] === 0) return true;
    }
    return false;
  } catch {
    return true;
  }
}

function isNodeBasedProject() {
  return ['vue_vite', 'react_vite', 'static', 'node', 'express'].includes(CONFIG.projectType);
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
    const { data: stagedFiles, error: stagingError } = await supabase.rpc('get_staged_changes_with_token', {
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
    
    // Track package.json changes for npm install - ONLY IF CONTENT CHANGED
    if (path.basename(file.path) === 'package.json') {
      let existingContent = '';
      if (fs.existsSync(filePath)) {
        existingContent = fs.readFileSync(filePath, 'utf8');
      }
      // Only trigger npm install if content is actually different
      if (existingContent !== (file.content || '')) {
        changedPackageJsonDirs.push(dirPath);
      }
    }
    
    // Write file
    fs.writeFileSync(filePath, file.content || '', 'utf8');
  }
  
  console.log(\`[Pronghorn] Wrote \${files.length} files to disk\`);
  return changedPackageJsonDirs;
}

async function runInstallCommand(dir) {
  if (!CONFIG.installCommand) {
    console.log('[Pronghorn] No install command configured, skipping...');
    return;
  }
  
  console.log(\`[Pronghorn] Running install command in \${dir}: \${CONFIG.installCommand}\`);
  try {
    execSync(CONFIG.installCommand, { cwd: dir, stdio: 'inherit' });
    console.log(\`[Pronghorn] Install completed in \${dir}\`);
  } catch (err) {
    console.error(\`[Pronghorn] Install failed in \${dir}:\`, err.message);
    await reportLog('error', \`Install failed in \${dir}: \${err.message}\`);
  }
}

// ============================================
// DEV SERVER MANAGEMENT
// ============================================

function startDevServer() {
  const cwd = path.join(APP_DIR, CONFIG.runFolder.replace(/^\\//, ''));
  
  // Check if package.json exists and install deps (for Node-based projects)
  if (isNodeBasedProject()) {
    const packageJsonPath = path.join(cwd, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      console.log('[Pronghorn] Installing dependencies...');
      try {
        execSync(CONFIG.installCommand, { cwd, stdio: 'inherit' });
      } catch (err) {
        console.error('[Pronghorn] Install failed:', err.message);
        reportLog('error', \`Install failed: \${err.message}\`);
      }
    }
  }
  
  console.log('[Pronghorn] Starting dev server...');
  console.log(\`[Pronghorn] Command: \${CONFIG.runCommand}\`);
  console.log(\`[Pronghorn] Directory: \${cwd}\`);
  console.log(\`[Pronghorn] Project Type: \${CONFIG.projectType}\`);
  
  const [cmd, ...args] = CONFIG.runCommand.split(' ');
  devProcess = spawn(cmd, args, {
    cwd,
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1', PORT: CONFIG.appPort },
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
// STAGING SYNC (simplified approach)
// ============================================

async function syncStagingToLocal() {
  console.log('[Pronghorn] ========== SYNCING STAGING TO LOCAL ==========');
  console.log(\`[Pronghorn] Fetching staged changes for repo: \${CONFIG.repoId}\`);
  
  try {
    // Fetch current staging state
    const { data: stagedFiles, error } = await supabase.rpc('get_staged_changes_with_token', {
      p_repo_id: CONFIG.repoId,
      p_token: CONFIG.shareToken || null,
    });
    
    if (error) {
      console.error('[Pronghorn] Error fetching staging:', error.message);
      return;
    }
    
    console.log(\`[Pronghorn] Fetched \${stagedFiles?.length || 0} staged files from database\`);
    
    const currentStagedPaths = new Set();
    let needsRestart = false;
    
    // Process all staged files
    for (const staged of (stagedFiles || [])) {
      currentStagedPaths.add(staged.file_path);
      const fullPath = path.join(APP_DIR, staged.file_path);
      const dirPath = path.dirname(fullPath);
      
      if (staged.operation_type === 'delete') {
        // File marked for deletion - delete locally
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          console.log(\`[Pronghorn] Deleted (staged delete): \${staged.file_path}\`);
        }
      } else {
        // 'add' or 'edit' - write new_content
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
        
        // Check if file exists and use hash comparison before writing
        const fileExists = fs.existsSync(fullPath);
        const newContent = staged.new_content || '';
        const newHash = hashContent(newContent);
        
        let shouldWrite = !fileExists;
        if (fileExists) {
          const existingContent = fs.readFileSync(fullPath, 'utf8');
          const existingHash = hashContent(existingContent);
          shouldWrite = (newHash !== existingHash);
        }
        
        if (shouldWrite) {
          fs.writeFileSync(fullPath, newContent, 'utf8');
          console.log(\`[Pronghorn] Written (staged \${staged.operation_type}): \${staged.file_path}\`);
          
          // Check for package.json changes
          if (path.basename(staged.file_path) === 'package.json') {
            needsRestart = true;
            console.log('[Pronghorn] package.json changed - will run install');
            await runInstallCommand(dirPath);
          }
        }
      }
    }
    
    // Check for unstaged files (were in knownStagedFiles, now absent)
    for (const [filePath, oldState] of knownStagedFiles) {
      if (!currentStagedPaths.has(filePath)) {
        console.log(\`[Pronghorn] File unstaged: \${filePath}\`);
        
        // Fetch from repo_files to revert to committed version
        const { data: repoFiles, error: repoError } = await supabase.rpc('get_repo_files_with_token', {
          p_repo_id: CONFIG.repoId,
          p_token: CONFIG.shareToken || null,
        });
        
        if (repoError) {
          console.error('[Pronghorn] Error fetching repo_files:', repoError.message);
          continue;
        }
        
        const committedFile = repoFiles?.find(f => f.path === filePath);
        const fullPath = path.join(APP_DIR, filePath);
        const dirPath = path.dirname(fullPath);
        
        if (committedFile) {
          // Revert to committed version
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }
          fs.writeFileSync(fullPath, committedFile.content || '', 'utf8');
          console.log(\`[Pronghorn] Reverted to committed version: \${filePath}\`);
        } else {
          // Was a staged 'add' that got rolled back - delete local file
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(\`[Pronghorn] Deleted (staged add rolled back): \${filePath}\`);
          }
        }
      }
    }
    
    // Update known state
    knownStagedFiles.clear();
    for (const staged of (stagedFiles || [])) {
      knownStagedFiles.set(staged.file_path, {
        operation_type: staged.operation_type,
        new_content: staged.new_content
      });
    }
    
    console.log(\`[Pronghorn] Synced \${stagedFiles?.length || 0} staged files\`);
    console.log('[Pronghorn] ================================================');
    
    // Handle server restart if needed
    if (needsRestart) {
      await restartDevServer();
    }
    
  } catch (err) {
    console.error('[Pronghorn] Error syncing staging:', err.message);
    await reportLog('error', \`Failed to sync staging: \${err.message}\`);
  }
}

function scheduleStagingSync() {
  // Debounce to handle DELETE+INSERT pairs during updates
  clearTimeout(stagingSyncTimer);
  stagingSyncTimer = setTimeout(async () => {
    await syncStagingToLocal();
  }, STAGING_DEBOUNCE_MS);
}

async function initializeKnownStagedFiles() {
  console.log('[Pronghorn] Initializing known staged files...');
  
  const { data: stagedFiles, error } = await supabase.rpc('get_staged_changes_with_token', {
    p_repo_id: CONFIG.repoId,
    p_token: CONFIG.shareToken || null,
  });
  
  if (error) {
    console.error('[Pronghorn] Error fetching initial staging:', error.message);
    return;
  }
  
  if (stagedFiles) {
    for (const staged of stagedFiles) {
      knownStagedFiles.set(staged.file_path, {
        operation_type: staged.operation_type,
        new_content: staged.new_content
      });
    }
    console.log(\`[Pronghorn] Initialized with \${stagedFiles.length} known staged files\`);
  }
}

// ============================================
// REALTIME SUBSCRIPTION (BROADCAST PATTERN)
// ============================================

async function setupRealtimeSubscription() {
  console.log('[Pronghorn] ========== SETTING UP REALTIME SUBSCRIPTIONS ==========');
  console.log(\`[Pronghorn] Repo ID: \${CONFIG.repoId}\`);
  
  // Channel names MUST match what edge functions broadcast on
  const stagingChannelName = \`repo-staging-\${CONFIG.repoId}\`;
  const filesChannelName = \`repo-files-\${CONFIG.repoId}\`;
  
  // Subscribe to staging broadcasts
  const stagingChannel = supabase
    .channel(stagingChannelName)
    .on(
      'broadcast',
      { event: 'staging_refresh' },
      async (payload) => {
        console.log('[Pronghorn] ========== STAGING BROADCAST RECEIVED ==========');
        
        if (!CONFIG.rebuildOnStaging) {
          console.log('[Pronghorn] REBUILD_ON_STAGING is false, ignoring');
          return;
        }
        
        scheduleStagingSync();
      }
    )
    .subscribe((status) => {
      console.log(\`[Pronghorn] Staging channel status: \${status}\`);
      if (status === 'SUBSCRIBED') {
        console.log('[Pronghorn] ✓ Listening for staging_refresh broadcasts');
      }
    });
  
  // Subscribe to files broadcasts + postgres_changes fallback
  const filesChannel = supabase
    .channel(filesChannelName)
    .on(
      'broadcast',
      { event: 'files_refresh' },
      async (payload) => {
        console.log('[Pronghorn] ========== FILES BROADCAST RECEIVED ==========');
        
        if (!CONFIG.rebuildOnFiles) {
          console.log('[Pronghorn] REBUILD_ON_FILES is false, ignoring');
          return;
        }
        
        await syncAllFilesFromDatabase();
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
        console.log('[Pronghorn] === FILES EVENT (postgres_changes) ===');
        await handleRepoFileChange(payload);
      }
    )
    .subscribe((status) => {
      console.log(\`[Pronghorn] Files channel status: \${status}\`);
      if (status === 'SUBSCRIBED') {
        console.log('[Pronghorn] ✓ Listening for files_refresh broadcasts + postgres_changes');
      }
    });
  
  return { stagingChannel, filesChannel };
}

async function syncAllFilesFromDatabase() {
  console.log('[Pronghorn] Syncing all files from database...');
  try {
    const files = await fetchAllFiles();
    const changedDirs = await writeFilesToDisk(files);
    if (changedDirs.length > 0) {
      for (const dir of changedDirs) {
        await runInstallCommand(dir);
      }
      await restartDevServer();
    }
  } catch (err) {
    console.error('[Pronghorn] Error syncing all files:', err.message);
    await reportLog('error', \`Failed to sync all files: \${err.message}\`);
  }
}

async function handleRepoFileChange(payload) {
  console.log(\`[Pronghorn] Processing repo_files change: \${payload.eventType}\`);
  
  try {
    let filePath, content, isDelete = false;
    
    if (payload.eventType === 'DELETE') {
      const record = payload.old;
      if (!record || !record.path) return;
      filePath = record.path;
      isDelete = true;
    } else {
      const record = payload.new;
      if (!record || !record.path) return;
      filePath = record.path;
      content = record.content;
    }
    
    const fullPath = path.join(APP_DIR, filePath);
    const dirPath = path.dirname(fullPath);
    
    if (isDelete) {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log(\`[Pronghorn] Deleted from disk: \${filePath}\`);
      }
    } else {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      // Check if package.json and content actually changed
      let needsInstall = false;
      if (path.basename(filePath) === 'package.json') {
        let existingContent = '';
        if (fs.existsSync(fullPath)) {
          existingContent = fs.readFileSync(fullPath, 'utf8');
        }
        if (existingContent !== (content || '')) {
          needsInstall = true;
        }
      }
      
      fs.writeFileSync(fullPath, content || '', 'utf8');
      console.log(\`[Pronghorn] Written to disk: \${filePath}\`);
      
      if (needsInstall) {
        console.log('[Pronghorn] package.json changed - running install...');
        await stopDevServer();
        await runInstallCommand(dirPath);
        startDevServer();
      } else if (!isNodeBasedProject() || CONFIG.projectType === 'node' || CONFIG.projectType === 'express') {
        await restartDevServer();
      }
    }
  } catch (err) {
    console.error('[Pronghorn] Error handling repo file change:', err.message);
    await reportLog('error', \`Failed to sync file: \${err.message}\`);
  }
}

// ============================================
// LOCAL FILE WATCHER (for bidirectional sync)
// ============================================

let localFileWatcher = null;

async function setupLocalFileWatcher() {
  console.log('[Pronghorn] Setting up local file watcher for bidirectional sync...');
  
  const chokidar = require('chokidar');
  
  localFileWatcher = chokidar.watch(APP_DIR, {
    ignored: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/.cache/**',
      '**/coverage/**',
      '**/__pycache__/**',
      '**/target/**',
      '**/*.log',
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });
  
  localFileWatcher.on('add', async (fullPath) => {
    const relativePath = path.relative(APP_DIR, fullPath).replace(/\\\\/g, '/');
    if (isBinaryFile(fullPath)) return;
    const content = fs.readFileSync(fullPath, 'utf8');
    await pushLocalChangeToCloud(relativePath, 'add', content);
  });
  
  localFileWatcher.on('change', async (fullPath) => {
    const relativePath = path.relative(APP_DIR, fullPath).replace(/\\\\/g, '/');
    if (isBinaryFile(fullPath)) return;
    const content = fs.readFileSync(fullPath, 'utf8');
    await pushLocalChangeToCloud(relativePath, 'edit', content);
  });
  
  localFileWatcher.on('unlink', async (fullPath) => {
    const relativePath = path.relative(APP_DIR, fullPath).replace(/\\\\/g, '/');
    await pushLocalChangeToCloud(relativePath, 'delete', null);
  });
  
  localFileWatcher.on('ready', () => {
    console.log('[Pronghorn] ✓ Local file watcher ready (bidirectional sync enabled)');
  });
  
  localFileWatcher.on('error', (error) => {
    console.error('[Pronghorn] File watcher error:', error.message);
  });
}

async function pushLocalChangeToCloud(relativePath, operationType, content) {
  console.log(\`[Pronghorn] Pushing to cloud: \${relativePath} (\${operationType})\`);
  
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(\`\${CONFIG.supabaseUrl}/functions/v1/staging-operations\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${CONFIG.supabaseAnonKey}\`,
      },
      body: JSON.stringify({
        action: 'stage',
        repoId: CONFIG.repoId,
        shareToken: CONFIG.shareToken,
        filePath: relativePath,
        operationType: operationType,
        oldContent: null,
        newContent: content,
      }),
    });
    
    const result = await response.json();
    if (result.success) {
      console.log(\`[Pronghorn] ✓ Pushed: \${relativePath}\`);
    } else {
      console.error(\`[Pronghorn] ✗ Push failed: \${result.error}\`);
    }
  } catch (err) {
    console.error(\`[Pronghorn] Push error: \${err.message}\`);
  }
}

// ============================================
// PROJECT DATA SYNC (Phase 3)
// Exports requirements, canvas, artifacts, specifications to local folder
// ============================================

const PROJECT_DIR = path.resolve(CONFIG.projectSyncFolder);

async function ensureProjectDir() {
  if (!fs.existsSync(PROJECT_DIR)) {
    fs.mkdirSync(PROJECT_DIR, { recursive: true });
    console.log(\`[Pronghorn] Created project sync folder: \${PROJECT_DIR}\`);
  }
}

async function fetchAndWriteRequirements() {
  console.log('[Pronghorn] Syncing requirements...');
  try {
    const { data: requirements, error } = await supabase.rpc('get_requirements_with_token', {
      p_project_id: CONFIG.projectId,
      p_token: CONFIG.shareToken || null,
    });
    
    if (error) {
      console.error('[Pronghorn] Error fetching requirements:', error.message);
      return;
    }
    
    if (!requirements || requirements.length === 0) {
      console.log('[Pronghorn] No requirements found');
      return;
    }
    
    // Build tree structure
    const reqMap = new Map();
    requirements.forEach(r => reqMap.set(r.id, { ...r, children: [] }));
    const rootReqs = [];
    requirements.forEach(r => {
      if (r.parent_id && reqMap.has(r.parent_id)) {
        reqMap.get(r.parent_id).children.push(reqMap.get(r.id));
      } else {
        rootReqs.push(reqMap.get(r.id));
      }
    });
    
    // Sort by order_index
    const sortReqs = (arr) => arr.sort((a, b) => a.order_index - b.order_index);
    sortReqs(rootReqs);
    rootReqs.forEach(r => sortReqs(r.children));
    
    // Create requirements subfolder
    const reqDir = path.join(PROJECT_DIR, 'requirements');
    if (!fs.existsSync(reqDir)) {
      fs.mkdirSync(reqDir, { recursive: true });
    }
    
    // Write JSON
    const jsonPath = path.join(reqDir, 'requirements.json');
    fs.writeFileSync(jsonPath, JSON.stringify(rootReqs, null, 2), 'utf8');
    
    // Write Markdown
    const mdPath = path.join(reqDir, 'requirements.md');
    let md = '# Requirements\\n\\n';
    const writeReqMd = (req, depth = 0) => {
      const indent = '  '.repeat(depth);
      const prefix = req.code ? \`[\${req.code}] \` : '';
      md += \`\${indent}- **\${prefix}\${req.title}** (\${req.type})\\n\`;
      if (req.content) {
        md += \`\${indent}  \${req.content}\\n\`;
      }
      req.children.forEach(child => writeReqMd(child, depth + 1));
    };
    rootReqs.forEach(r => writeReqMd(r));
    fs.writeFileSync(mdPath, md, 'utf8');
    
    console.log(\`[Pronghorn] Synced \${requirements.length} requirements\`);
  } catch (err) {
    console.error('[Pronghorn] Requirements sync error:', err.message);
  }
}

async function fetchAndWriteCanvas() {
  console.log('[Pronghorn] Syncing canvas...');
  try {
    const { data: nodes, error: nodesError } = await supabase.rpc('get_canvas_nodes_with_token', {
      p_project_id: CONFIG.projectId,
      p_token: CONFIG.shareToken || null,
    });
    
    const { data: edges, error: edgesError } = await supabase.rpc('get_canvas_edges_with_token', {
      p_project_id: CONFIG.projectId,
      p_token: CONFIG.shareToken || null,
    });
    
    if (nodesError) console.error('[Pronghorn] Canvas nodes error:', nodesError.message);
    if (edgesError) console.error('[Pronghorn] Canvas edges error:', edgesError.message);
    
    const canvas = {
      nodes: nodes || [],
      edges: edges || [],
      exportedAt: new Date().toISOString(),
    };
    
    // Create canvas subfolder
    const canvasDir = path.join(PROJECT_DIR, 'canvas');
    if (!fs.existsSync(canvasDir)) {
      fs.mkdirSync(canvasDir, { recursive: true });
    }
    
    const jsonPath = path.join(canvasDir, 'canvas.json');
    fs.writeFileSync(jsonPath, JSON.stringify(canvas, null, 2), 'utf8');
    
    // Write summary markdown
    const mdPath = path.join(canvasDir, 'canvas.md');
    let md = '# Canvas Summary\\n\\n';
    md += \`Nodes: \${canvas.nodes.length}\\n\`;
    md += \`Edges: \${canvas.edges.length}\\n\\n\`;
    md += '## Nodes\\n\\n';
    (nodes || []).forEach(n => {
      const label = n.data?.label || n.data?.title || n.type;
      md += \`- **\${label}** (type: \${n.type})\\n\`;
    });
    fs.writeFileSync(mdPath, md, 'utf8');
    
    console.log(\`[Pronghorn] Synced \${(nodes || []).length} canvas nodes, \${(edges || []).length} edges\`);
  } catch (err) {
    console.error('[Pronghorn] Canvas sync error:', err.message);
  }
}

async function fetchAndWriteArtifacts() {
  console.log('[Pronghorn] Syncing artifacts...');
  try {
    const { data: artifacts, error } = await supabase.rpc('get_artifacts_with_token', {
      p_project_id: CONFIG.projectId,
      p_token: CONFIG.shareToken || null,
    });
    
    if (error) {
      console.error('[Pronghorn] Artifacts error:', error.message);
      return;
    }
    
    // Create artifacts subfolder
    const artifactsDir = path.join(PROJECT_DIR, 'artifacts');
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }
    
    // Get existing files in artifacts dir to detect deletions
    const existingFiles = new Set();
    try {
      const files = fs.readdirSync(artifactsDir);
      files.forEach(f => existingFiles.add(f));
    } catch (e) {
      // Directory might not exist yet
    }
    
    const writtenFiles = new Set(['index.json']);
    
    if (!artifacts || artifacts.length === 0) {
      console.log('[Pronghorn] No artifacts found, cleaning up directory');
      // Write empty index
      fs.writeFileSync(path.join(artifactsDir, 'index.json'), '[]', 'utf8');
    } else {
      // Write index
      const indexPath = path.join(artifactsDir, 'index.json');
      fs.writeFileSync(indexPath, JSON.stringify(artifacts.map(a => ({
        id: a.id,
        title: a.ai_title || 'Untitled',
        summary: a.ai_summary,
        source_type: a.source_type,
        created_at: a.created_at,
      })), null, 2), 'utf8');
      
      // Write each artifact as markdown with ID-based filename for stability
      artifacts.forEach((artifact) => {
        const title = artifact.ai_title || 'Untitled';
        const filename = \`\${artifact.id.slice(0, 8)}.md\`;
        const mdPath = path.join(artifactsDir, filename);
        writtenFiles.add(filename);
        
        let content = \`# \${title}\\n\\n\`;
        if (artifact.ai_summary) {
          content += \`> \${artifact.ai_summary}\\n\\n\`;
        }
        content += artifact.content || '';
        
        fs.writeFileSync(mdPath, content, 'utf8');
      });
      
      console.log(\`[Pronghorn] Synced \${artifacts.length} artifacts\`);
    }
    
    // Clean up deleted artifacts
    existingFiles.forEach(file => {
      if (!writtenFiles.has(file)) {
        const filePath = path.join(artifactsDir, file);
        try {
          fs.unlinkSync(filePath);
          console.log(\`[Pronghorn] Removed deleted artifact: \${file}\`);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });
  } catch (err) {
    console.error('[Pronghorn] Artifacts sync error:', err.message);
  }
}

async function fetchAndWriteSpecifications() {
  console.log('[Pronghorn] Syncing specifications...');
  try {
    // Use correct RPC function name: get_project_specifications_with_token
    const { data: specs, error } = await supabase.rpc('get_project_specifications_with_token', {
      p_project_id: CONFIG.projectId,
      p_token: CONFIG.shareToken || null,
      p_agent_id: null,
      p_latest_only: false,
    });
    
    if (error) {
      console.error('[Pronghorn] Specifications error:', error.message);
      return;
    }
    
    if (!specs || specs.length === 0) {
      console.log('[Pronghorn] No specifications found');
      return;
    }
    
    // Create specifications subfolder
    const specsDir = path.join(PROJECT_DIR, 'specifications');
    if (!fs.existsSync(specsDir)) {
      fs.mkdirSync(specsDir, { recursive: true });
    }
    
    // Write latest spec as markdown
    const latest = specs.find(s => s.is_latest) || specs[0];
    const specPath = path.join(specsDir, 'specification.md');
    fs.writeFileSync(specPath, latest.generated_spec || '', 'utf8');
    
    // Write all versions as JSON
    const jsonPath = path.join(specsDir, 'specifications.json');
    fs.writeFileSync(jsonPath, JSON.stringify(specs.map(s => ({
      id: s.id,
      version: s.version,
      is_latest: s.is_latest,
      agent_title: s.agent_title,
      created_at: s.created_at,
    })), null, 2), 'utf8');
    
    console.log(\`[Pronghorn] Synced \${specs.length} specifications (latest v\${latest.version})\`);
  } catch (err) {
    console.error('[Pronghorn] Specifications sync error:', err.message);
  }
}

async function fetchAndWriteChats() {
  console.log('[Pronghorn] Syncing chat sessions...');
  try {
    const { data: sessions, error } = await supabase.rpc('get_chat_sessions_with_token', {
      p_project_id: CONFIG.projectId,
      p_token: CONFIG.shareToken || null,
    });
    
    if (error) {
      console.error('[Pronghorn] Chat sessions error:', error.message);
      return;
    }
    
    // Create chats subfolder
    const chatsDir = path.join(PROJECT_DIR, 'chats');
    if (!fs.existsSync(chatsDir)) {
      fs.mkdirSync(chatsDir, { recursive: true });
    }
    
    // Get existing files to detect deletions
    const existingFiles = new Set();
    try {
      const files = fs.readdirSync(chatsDir);
      files.forEach(f => existingFiles.add(f));
    } catch (e) {
      // Directory might not exist yet
    }
    
    const writtenFiles = new Set(['index.json']);
    
    if (!sessions || sessions.length === 0) {
      console.log('[Pronghorn] No chat sessions found');
      fs.writeFileSync(path.join(chatsDir, 'index.json'), '[]', 'utf8');
    } else {
      // Write index
      fs.writeFileSync(path.join(chatsDir, 'index.json'), JSON.stringify(sessions.map(s => ({
        id: s.id,
        title: s.ai_title || s.title || 'Untitled Chat',
        summary: s.ai_summary,
        created_at: s.created_at,
        updated_at: s.updated_at,
      })), null, 2), 'utf8');
      
      // Write each session's messages
      for (const session of sessions) {
        const filename = \`\${session.id.slice(0, 8)}.json\`;
        writtenFiles.add(filename);
        
        const { data: messages } = await supabase.rpc('get_chat_messages_with_token', {
          p_chat_session_id: session.id,
          p_token: CONFIG.shareToken || null,
        });
        
        const sessionData = {
          id: session.id,
          title: session.ai_title || session.title || 'Untitled Chat',
          summary: session.ai_summary,
          messages: (messages || []).map(m => ({
            role: m.role,
            content: m.content,
            created_at: m.created_at,
          })),
        };
        
        fs.writeFileSync(path.join(chatsDir, filename), JSON.stringify(sessionData, null, 2), 'utf8');
      }
      
      console.log(\`[Pronghorn] Synced \${sessions.length} chat sessions\`);
    }
    
    // Clean up deleted chats
    existingFiles.forEach(file => {
      if (!writtenFiles.has(file)) {
        try {
          fs.unlinkSync(path.join(chatsDir, file));
          console.log(\`[Pronghorn] Removed deleted chat: \${file}\`);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });
  } catch (err) {
    console.error('[Pronghorn] Chat sessions sync error:', err.message);
  }
}

async function fetchAndWriteProjectSettings() {
  console.log('[Pronghorn] Syncing project settings...');
  try {
    const { data, error } = await supabase.rpc('get_project_with_token', {
      p_project_id: CONFIG.projectId,
      p_token: CONFIG.shareToken || null,
    });
    
    if (error) {
      console.error('[Pronghorn] Project settings error:', error.message);
      return;
    }
    
    // Create settings subfolder
    const settingsDir = path.join(PROJECT_DIR, 'settings');
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(settingsDir, 'project.json'), JSON.stringify(data, null, 2), 'utf8');
    console.log('[Pronghorn] Synced project settings');
  } catch (err) {
    console.error('[Pronghorn] Project settings sync error:', err.message);
  }
}

async function fetchAndWriteRepositories() {
  console.log('[Pronghorn] Syncing repositories...');
  try {
    const { data, error } = await supabase.rpc('get_project_repos_with_token', {
      p_project_id: CONFIG.projectId,
      p_token: CONFIG.shareToken || null,
    });
    
    if (error) {
      console.error('[Pronghorn] Repositories error:', error.message);
      return;
    }
    
    // Create repositories subfolder
    const reposDir = path.join(PROJECT_DIR, 'repositories');
    if (!fs.existsSync(reposDir)) {
      fs.mkdirSync(reposDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(reposDir, 'repos.json'), JSON.stringify(data || [], null, 2), 'utf8');
    console.log(\`[Pronghorn] Synced \${(data || []).length} repositories\`);
  } catch (err) {
    console.error('[Pronghorn] Repositories sync error:', err.message);
  }
}

async function fetchAndWriteDatabases() {
  console.log('[Pronghorn] Syncing databases...');
  try {
    const { data, error } = await supabase.rpc('get_databases_with_token', {
      p_project_id: CONFIG.projectId,
      p_token: CONFIG.shareToken || null,
    });
    
    if (error) {
      console.error('[Pronghorn] Databases error:', error.message);
      return;
    }
    
    // Create databases subfolder
    const dbDir = path.join(PROJECT_DIR, 'databases');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(dbDir, 'databases.json'), JSON.stringify(data || [], null, 2), 'utf8');
    console.log(\`[Pronghorn] Synced \${(data || []).length} databases\`);
  } catch (err) {
    console.error('[Pronghorn] Databases sync error:', err.message);
  }
}

async function fetchAndWriteDeployments() {
  console.log('[Pronghorn] Syncing deployments...');
  try {
    const { data, error } = await supabase.rpc('get_deployments_with_token', {
      p_project_id: CONFIG.projectId,
      p_token: CONFIG.shareToken || null,
    });
    
    if (error) {
      console.error('[Pronghorn] Deployments error:', error.message);
      return;
    }
    
    // Create deployments subfolder
    const deploysDir = path.join(PROJECT_DIR, 'deployments');
    if (!fs.existsSync(deploysDir)) {
      fs.mkdirSync(deploysDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(deploysDir, 'deployments.json'), JSON.stringify(data || [], null, 2), 'utf8');
    console.log(\`[Pronghorn] Synced \${(data || []).length} deployments\`);
  } catch (err) {
    console.error('[Pronghorn] Deployments sync error:', err.message);
  }
}

async function syncAllProjectData() {
  console.log('[Pronghorn] ========== SYNCING PROJECT DATA ==========');
  await ensureProjectDir();
  await Promise.all([
    fetchAndWriteProjectSettings(),
    fetchAndWriteRequirements(),
    fetchAndWriteCanvas(),
    fetchAndWriteArtifacts(),
    fetchAndWriteSpecifications(),
    fetchAndWriteChats(),
    fetchAndWriteRepositories(),
    fetchAndWriteDatabases(),
    fetchAndWriteDeployments(),
  ]);
  console.log('[Pronghorn] ========== PROJECT DATA SYNC COMPLETE ==========');
}

async function setupProjectDataSubscription() {
  console.log('[Pronghorn] Setting up project data realtime subscriptions (broadcast + postgres_changes fallback)...');
  
  const channels = [];
  
  // Subscribe to project settings channel
  const projectChannel = supabase
    .channel(\`project-\${CONFIG.projectId}\`)
    .on('broadcast', { event: 'project_refresh' }, async () => {
      console.log('[Pronghorn] Project refresh broadcast received');
      await fetchAndWriteProjectSettings();
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'projects',
      filter: \`id=eq.\${CONFIG.projectId}\`,
    }, async () => {
      console.log('[Pronghorn] Project postgres_changes received');
      await fetchAndWriteProjectSettings();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Pronghorn] ✓ Listening for project settings');
      }
    });
  channels.push(projectChannel);
  
  // Subscribe to requirements channel - matches frontend's useRealtimeRequirements
  const requirementsChannel = supabase
    .channel(\`requirements-\${CONFIG.projectId}\`)
    .on('broadcast', { event: 'requirements_refresh' }, async () => {
      console.log('[Pronghorn] Requirements refresh broadcast received');
      await fetchAndWriteRequirements();
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'requirements',
      filter: \`project_id=eq.\${CONFIG.projectId}\`,
    }, async () => {
      console.log('[Pronghorn] Requirements postgres_changes received');
      await fetchAndWriteRequirements();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Pronghorn] ✓ Listening for requirements');
      }
    });
  channels.push(requirementsChannel);
  
  // Subscribe to canvas nodes channel - matches frontend's useRealtimeCanvas
  const canvasNodesChannel = supabase
    .channel(\`canvas-nodes-\${CONFIG.projectId}\`)
    .on('broadcast', { event: 'canvas_refresh' }, async () => {
      console.log('[Pronghorn] Canvas nodes refresh broadcast received');
      await fetchAndWriteCanvas();
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'canvas_nodes',
      filter: \`project_id=eq.\${CONFIG.projectId}\`,
    }, async () => {
      console.log('[Pronghorn] Canvas nodes postgres_changes received');
      await fetchAndWriteCanvas();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Pronghorn] ✓ Listening for canvas nodes');
      }
    });
  channels.push(canvasNodesChannel);
  
  // Subscribe to canvas edges channel - matches frontend's useRealtimeCanvas
  const canvasEdgesChannel = supabase
    .channel(\`canvas-edges-\${CONFIG.projectId}\`)
    .on('broadcast', { event: 'canvas_refresh' }, async () => {
      console.log('[Pronghorn] Canvas edges refresh broadcast received');
      await fetchAndWriteCanvas();
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'canvas_edges',
      filter: \`project_id=eq.\${CONFIG.projectId}\`,
    }, async () => {
      console.log('[Pronghorn] Canvas edges postgres_changes received');
      await fetchAndWriteCanvas();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Pronghorn] ✓ Listening for canvas edges');
      }
    });
  channels.push(canvasEdgesChannel);
  
  // Subscribe to artifacts channel - matches frontend's useRealtimeArtifacts
  const artifactsChannel = supabase
    .channel(\`artifacts-\${CONFIG.projectId}\`)
    .on('broadcast', { event: 'artifact_refresh' }, async () => {
      console.log('[Pronghorn] Artifacts refresh broadcast received');
      await fetchAndWriteArtifacts();
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'artifacts',
      filter: \`project_id=eq.\${CONFIG.projectId}\`,
    }, async () => {
      console.log('[Pronghorn] Artifacts postgres_changes received');
      await fetchAndWriteArtifacts();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Pronghorn] ✓ Listening for artifacts');
      }
    });
  channels.push(artifactsChannel);
  
  // Subscribe to specifications channel - matches frontend's useRealtimeSpecifications
  const specificationsChannel = supabase
    .channel(\`specifications-\${CONFIG.projectId}\`)
    .on('broadcast', { event: 'specification_refresh' }, async () => {
      console.log('[Pronghorn] Specifications refresh broadcast received');
      await fetchAndWriteSpecifications();
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'project_specifications',
      filter: \`project_id=eq.\${CONFIG.projectId}\`,
    }, async () => {
      console.log('[Pronghorn] Specifications postgres_changes received');
      await fetchAndWriteSpecifications();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Pronghorn] ✓ Listening for specifications');
      }
    });
  channels.push(specificationsChannel);
  
  // Subscribe to chat sessions channel - matches frontend's useRealtimeChatSessions
  const chatSessionsChannel = supabase
    .channel(\`chat-sessions-\${CONFIG.projectId}\`)
    .on('broadcast', { event: 'chat_session_refresh' }, async () => {
      console.log('[Pronghorn] Chat sessions refresh broadcast received');
      await fetchAndWriteChats();
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'chat_sessions',
      filter: \`project_id=eq.\${CONFIG.projectId}\`,
    }, async () => {
      console.log('[Pronghorn] Chat sessions postgres_changes received');
      await fetchAndWriteChats();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Pronghorn] ✓ Listening for chat sessions');
      }
    });
  channels.push(chatSessionsChannel);
  
  // Subscribe to chat messages channel (for real-time message updates)
  const chatMessagesChannel = supabase
    .channel(\`chat-messages-\${CONFIG.projectId}\`)
    .on('broadcast', { event: 'chat_message_refresh' }, async () => {
      console.log('[Pronghorn] Chat message broadcast received');
      await fetchAndWriteChats();
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'chat_messages',
      filter: \`project_id=eq.\${CONFIG.projectId}\`,
    }, async (payload) => {
      console.log('[Pronghorn] Chat message postgres_changes received');
      await fetchAndWriteChats();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Pronghorn] ✓ Listening for chat messages');
      }
    });
  channels.push(chatMessagesChannel);
  
  // Subscribe to repositories channel
  const reposChannel = supabase
    .channel(\`project_repos-\${CONFIG.projectId}\`)
    .on('broadcast', { event: 'repos_refresh' }, async () => {
      console.log('[Pronghorn] Repositories refresh broadcast received');
      await fetchAndWriteRepositories();
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'project_repos',
      filter: \`project_id=eq.\${CONFIG.projectId}\`,
    }, async () => {
      console.log('[Pronghorn] Repositories postgres_changes received');
      await fetchAndWriteRepositories();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Pronghorn] ✓ Listening for repositories');
      }
    });
  channels.push(reposChannel);
  
  // Subscribe to databases channel
  const databasesChannel = supabase
    .channel(\`databases-\${CONFIG.projectId}\`)
    .on('broadcast', { event: 'database_refresh' }, async () => {
      console.log('[Pronghorn] Databases refresh broadcast received');
      await fetchAndWriteDatabases();
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'project_databases',
      filter: \`project_id=eq.\${CONFIG.projectId}\`,
    }, async () => {
      console.log('[Pronghorn] Databases postgres_changes received');
      await fetchAndWriteDatabases();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Pronghorn] ✓ Listening for databases');
      }
    });
  channels.push(databasesChannel);
  
  // Subscribe to deployments channel
  const deploymentsChannel = supabase
    .channel(\`deployments-\${CONFIG.projectId}\`)
    .on('broadcast', { event: 'deployment_refresh' }, async () => {
      console.log('[Pronghorn] Deployments refresh broadcast received');
      await fetchAndWriteDeployments();
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'project_deployments',
      filter: \`project_id=eq.\${CONFIG.projectId}\`,
    }, async () => {
      console.log('[Pronghorn] Deployments postgres_changes received');
      await fetchAndWriteDeployments();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Pronghorn] ✓ Listening for deployments');
      }
    });
  channels.push(deploymentsChannel);
  
  console.log('[Pronghorn] All project data channels set up (broadcast + postgres_changes)');
  return channels;
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║         Pronghorn Real-Time Local Development Runner             ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(\`║  Deployment: \${(CONFIG.deploymentId?.slice(0, 8) || 'N/A').padEnd(52)} ║\`);
  console.log(\`║  Project Type: \${CONFIG.projectType.padEnd(50)} ║\`);
  console.log(\`║  Run Command: \${CONFIG.runCommand.padEnd(51)} ║\`);
  console.log(\`║  Install Command: \${(CONFIG.installCommand || 'N/A').padEnd(47)} ║\`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(\`║  Rebuild on Staging: \${CONFIG.rebuildOnStaging ? 'YES' : 'NO '}                                           ║\`);
  console.log(\`║  Rebuild on Files: \${CONFIG.rebuildOnFiles ? 'YES' : 'NO '}                                             ║\`);
  console.log(\`║  Push Local Changes: \${CONFIG.pushLocalChanges ? 'YES' : 'NO '}                                          ║\`);
  console.log(\`║  Sync Project Data: \${CONFIG.syncProjectData ? 'YES' : 'NO '}                                            ║\`);
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');

  if (!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey) {
    console.error('[Pronghorn] Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
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
    
    // Run install in any directories with package.json on initial load
    if (packageJsonDirs.length > 0) {
      console.log(\`[Pronghorn] Found \${packageJsonDirs.length} package.json file(s), installing dependencies...\`);
      for (const dir of packageJsonDirs) {
        await runInstallCommand(dir);
      }
    }
    
    await reportLog('info', \`Initial sync complete (\${files.length} files)\`);
    
    // Initialize known staged files for unstaging detection
    await initializeKnownStagedFiles();
    
    // Setup realtime subscription
    await setupRealtimeSubscription();
    
    // Setup local file watcher for bidirectional sync
    if (CONFIG.pushLocalChanges) {
      await setupLocalFileWatcher();
    } else {
      console.log('[Pronghorn] Local → Cloud sync disabled (PUSH_LOCAL_CHANGES=false)');
    }
    
    // Setup project data sync (Phase 3)
    if (CONFIG.syncProjectData) {
      await syncAllProjectData();
      await setupProjectDataSubscription();
    } else {
      console.log('[Pronghorn] Project data sync disabled (SYNC_PROJECT_DATA=false)');
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
  return `# Pronghorn Runner - ${deployment.environment}-${deployment.name}

This package provides **bidirectional real-time synchronization** with Pronghorn.

## 🚀 Installation Options

### Option 1: Download Full Package (this ZIP)
\`\`\`bash
# Extract ZIP, then:
npm install
npm start
\`\`\`

### Option 2: Git Clone (Recommended for updates)
\`\`\`bash
git clone https://github.com/pronghorn-red/pronghorn-runner.git
cd pronghorn-runner
# Download your .env from Pronghorn and place it here
npm install
npm start
\`\`\`

## ⚙️ Configuration

All configuration is in the \`.env\` file. Key settings:

### Runtime Configuration
\`\`\`env
PROJECT_TYPE=vue_vite   # vue_vite, react_vite, node, python, go, ruby, rust, elixir, docker
RUN_COMMAND=npm run dev
BUILD_COMMAND=npm run build
INSTALL_COMMAND=npm install
\`\`\`

### Sync Settings
| Variable | Default | Description |
|----------|---------|-------------|
| \`REBUILD_ON_STAGING\` | \`true\` | Sync when files are staged |
| \`REBUILD_ON_FILES\` | \`true\` | Sync when files are committed |
| \`PUSH_LOCAL_CHANGES\` | \`true\` | Push local edits back to cloud |
| \`SYNC_PROJECT_DATA\` | \`false\` | Export requirements, canvas, artifacts to ./project |
| \`PROJECT_SYNC_FOLDER\` | \`./project\` | Folder for project data exports |

### Multi-Runtime Support

| Type | Runtime | Install Command | Run Command |
|------|---------|-----------------|-------------|
| vue_vite | Node.js | npm install | npm run dev |
| react_vite | Node.js | npm install | npm run dev |
| node | Node.js | npm install | node index.js |
| python | Python 3 | pip install -r requirements.txt | python main.py |
| go | Go 1.18+ | go mod download | ./app |
| ruby | Ruby | bundle install | bundle exec ruby app.rb |
| rust | Rust | - | cargo run --release |
| elixir | Elixir | mix deps.get | mix phx.server |
| docker | Docker | - | docker-compose up |

## 📁 How It Works

### Cloud → Local (Pull)
1. Downloads all files from Pronghorn to \`./app/\`
2. Listens for real-time changes
3. Updates files when changes detected
4. Hot-reloads or restarts server as needed

### Local → Cloud (Push)
1. Watches \`./app/\` for file changes
2. Automatically pushes edits to Pronghorn staging
3. Binary files are skipped

### Project Data Export (Enabled by Default)
When \`SYNC_PROJECT_DATA=true\`:
1. Exports project settings to \`./project/settings/\` folder
2. Exports requirements to \`./project/requirements/\` folder
3. Exports canvas nodes/edges to \`./project/canvas/\` folder
4. Exports artifacts to \`./project/artifacts/\` folder
5. Exports specifications to \`./project/specifications/\` folder
6. Exports chat sessions to \`./project/chats/\` folder
7. Exports repositories to \`./project/repositories/\` folder
8. Exports databases to \`./project/databases/\` folder
9. Exports deployments to \`./project/deployments/\` folder
10. Real-time sync: updates when project data changes in Pronghorn

## 📊 Project Details

| Property | Value |
|----------|-------|
| Project | ${project?.name || 'Unknown'} |
| Environment | ${deployment.environment} |
| Project Type | ${deployment.project_type || 'node'} |
| Run Command | \`${deployment.run_command || 'npm run dev'}\` |
${repo ? `| Repository | https://github.com/${repo.organization}/${repo.repo} |` : ''}

## 🔍 Troubleshooting

### "Cannot find module"
Run \`npm install\` in this directory.

### Files not syncing
1. Check \`PRONGHORN_SHARE_TOKEN\` is set in \`.env\`
2. Ensure \`PRONGHORN_REPO_ID\` is correct

### Port already in use
Change \`APP_PORT\` in your \`.env\` file.

---
Generated by Pronghorn.RED - Real-Time Development Platform
`;
}
