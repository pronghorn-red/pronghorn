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

    console.log(`[generate-local-package] DeploymentId: ${deploymentId}`);

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

    // Get repo details
    const { data: repo } = await supabase.rpc('get_repo_by_id_with_token', {
      p_repo_id: deployment.repo_id,
      p_token: shareToken || null,
    });

    // Get project details
    const { data: project } = await supabase.rpc('get_project_with_token', {
      p_project_id: deployment.project_id,
      p_token: shareToken || null,
    });

    // Create ZIP file
    const zip = new JSZip();

    // 1. Create .env file
    const envContent = generateEnvFile(deployment, shareToken);
    zip.file('.env', envContent);

    // 2. Create package.json
    const packageJson = generatePackageJson(deployment);
    zip.file('package.json', JSON.stringify(packageJson, null, 2));

    // 3. Create the runner script
    const runnerScript = generateRunnerScript(deployment, repo);
    zip.file('pronghorn-runner.js', runnerScript);

    // 4. Create README.md
    const readme = generateReadme(deployment, project, repo);
    zip.file('README.md', readme);

    // 5. Create a simple start script
    const startScript = `#!/bin/bash
npm install
node pronghorn-runner.js
`;
    zip.file('start.sh', startScript);

    // Generate the ZIP as base64
    const zipContent = await zip.generateAsync({ type: 'base64' });

    console.log('[generate-local-package] Package generated successfully');

    // Return as base64 that client can decode
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

function generateEnvFile(deployment: any, shareToken?: string): string {
  const lines = [
    '# Pronghorn Local Development Configuration',
    `# Generated for: ${deployment.name}`,
    `# Environment: ${deployment.environment}`,
    '',
    '# Pronghorn API Configuration',
    `PRONGHORN_API_URL=https://obkzdksfayygnrzdqoam.supabase.co`,
    `PRONGHORN_DEPLOYMENT_ID=${deployment.id}`,
    `PRONGHORN_PROJECT_ID=${deployment.project_id}`,
    shareToken ? `PRONGHORN_SHARE_TOKEN=${shareToken}` : '# PRONGHORN_SHARE_TOKEN=<your-token>',
    '',
    '# Application Configuration',
    `APP_ENVIRONMENT=${deployment.environment}`,
    `APP_PORT=3000`,
    '',
    '# User Environment Variables',
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
    description: `Local development runner for ${deployment.name}`,
    main: 'pronghorn-runner.js',
    scripts: {
      start: 'node pronghorn-runner.js',
      dev: 'node pronghorn-runner.js --watch',
    },
    dependencies: {
      'chokidar': '^3.5.3',
      'dotenv': '^16.3.1',
      'node-fetch': '^3.3.2',
    },
  };
}

function generateRunnerScript(deployment: any, repo: any): string {
  const repoUrl = repo ? `https://github.com/${repo.organization}/${repo.repo}.git` : '';
  
  return `#!/usr/bin/env node
/**
 * Pronghorn Local Development Runner
 * 
 * This script:
 * 1. Clones/pulls the repository
 * 2. Watches for file changes
 * 3. Runs build/dev commands
 * 4. Reports errors back to Pronghorn for AI-assisted fixing
 */

require('dotenv').config();
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const CONFIG = {
  repoUrl: '${repoUrl}',
  branch: '${deployment.branch || 'main'}',
  runFolder: '${deployment.run_folder || '/'}',
  buildFolder: '${deployment.build_folder || 'dist'}',
  runCommand: '${deployment.run_command || 'npm run dev'}',
  buildCommand: '${deployment.build_command || 'npm run build'}',
  deploymentId: process.env.PRONGHORN_DEPLOYMENT_ID,
  projectId: process.env.PRONGHORN_PROJECT_ID,
  apiUrl: process.env.PRONGHORN_API_URL,
  shareToken: process.env.PRONGHORN_SHARE_TOKEN,
};

const PROJECT_DIR = path.join(process.cwd(), 'project');

async function reportIssue(issueType, message, stackTrace = null, filePath = null, lineNumber = null) {
  if (!CONFIG.apiUrl || !CONFIG.deploymentId) {
    console.error('[Pronghorn] Cannot report issue - missing configuration');
    return;
  }

  try {
    const fetch = (await import('node-fetch')).default;
    await fetch(\`\${CONFIG.apiUrl}/functions/v1/report-local-issue\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deploymentId: CONFIG.deploymentId,
        shareToken: CONFIG.shareToken,
        issueType,
        message,
        stackTrace,
        filePath,
        lineNumber,
      }),
    });
    console.log('[Pronghorn] Issue reported successfully');
  } catch (err) {
    console.error('[Pronghorn] Failed to report issue:', err.message);
  }
}

function parseErrorOutput(output) {
  // Try to extract file path and line number from common error formats
  const patterns = [
    // Node.js/JavaScript: "at /path/to/file.js:123:45"
    /at\\s+(?:.*\\s+)?\\(?([^:]+):(\\d+):(\\d+)\\)?/,
    // TypeScript: "src/file.ts(10,5):"
    /([^(\\s]+)\\((\\d+),(\\d+)\\)/,
    // ESLint/Build: "/path/to/file.js:10:5"
    /^([^:]+):(\\d+):(\\d+)/m,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return {
        filePath: match[1],
        lineNumber: parseInt(match[2], 10),
      };
    }
  }
  return { filePath: null, lineNumber: null };
}

function runCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    console.log(\`[Pronghorn] Running: \${command}\`);
    
    const [cmd, ...args] = command.split(' ');
    const proc = spawn(cmd, args, {
      cwd,
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const errorInfo = parseErrorOutput(stderr || stdout);
        reject({
          code,
          message: stderr || stdout,
          ...errorInfo,
        });
      }
    });

    proc.on('error', (err) => {
      reject({ message: err.message });
    });
  });
}

async function setupProject() {
  console.log('[Pronghorn] Setting up project...');

  if (!CONFIG.repoUrl) {
    console.log('[Pronghorn] No repository URL configured. Skipping clone.');
    return;
  }

  if (!fs.existsSync(PROJECT_DIR)) {
    console.log('[Pronghorn] Cloning repository...');
    try {
      execSync(\`git clone -b \${CONFIG.branch} \${CONFIG.repoUrl} project\`, { stdio: 'inherit' });
    } catch (err) {
      await reportIssue('error', \`Failed to clone repository: \${err.message}\`);
      throw err;
    }
  } else {
    console.log('[Pronghorn] Pulling latest changes...');
    try {
      execSync(\`git -C project pull origin \${CONFIG.branch}\`, { stdio: 'inherit' });
    } catch (err) {
      console.warn('[Pronghorn] Warning: Failed to pull latest changes:', err.message);
    }
  }
}

async function runBuild() {
  if (!CONFIG.buildCommand) return;
  
  const cwd = path.join(PROJECT_DIR, CONFIG.runFolder.replace(/^\\//, ''));
  
  try {
    await runCommand(CONFIG.buildCommand, cwd);
    console.log('[Pronghorn] Build completed successfully');
  } catch (err) {
    console.error('[Pronghorn] Build failed:', err.message);
    await reportIssue('error', \`Build failed: \${err.message}\`, err.message, err.filePath, err.lineNumber);
    throw err;
  }
}

async function runDev() {
  const cwd = path.join(PROJECT_DIR, CONFIG.runFolder.replace(/^\\//, ''));
  
  console.log('[Pronghorn] Starting development server...');
  console.log(\`[Pronghorn] Working directory: \${cwd}\`);
  console.log(\`[Pronghorn] Command: \${CONFIG.runCommand}\`);
  
  const [cmd, ...args] = CONFIG.runCommand.split(' ');
  const proc = spawn(cmd, args, {
    cwd,
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  proc.stdout.on('data', (data) => {
    process.stdout.write(data);
  });

  proc.stderr.on('data', async (data) => {
    const text = data.toString();
    process.stderr.write(text);
    
    // Check for errors and report them
    if (text.includes('Error') || text.includes('error')) {
      const errorInfo = parseErrorOutput(text);
      await reportIssue('error', text.slice(0, 500), text, errorInfo.filePath, errorInfo.lineNumber);
    }
  });

  proc.on('close', (code) => {
    console.log(\`[Pronghorn] Process exited with code \${code}\`);
    if (code !== 0) {
      reportIssue('error', \`Process exited with code \${code}\`);
    }
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\\n[Pronghorn] Shutting down...');
    proc.kill('SIGINT');
    process.exit(0);
  });
}

async function main() {
  console.log('='.repeat(50));
  console.log('  Pronghorn Local Development Runner');
  console.log('='.repeat(50));
  console.log(\`  Deployment: \${CONFIG.deploymentId}\`);
  console.log(\`  Environment: ${deployment.environment}\`);
  console.log('='.repeat(50));
  console.log('');

  try {
    await setupProject();
    
    // Install dependencies if package.json exists
    const packageJsonPath = path.join(PROJECT_DIR, CONFIG.runFolder.replace(/^\\//, ''), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      console.log('[Pronghorn] Installing dependencies...');
      execSync('npm install', { 
        cwd: path.join(PROJECT_DIR, CONFIG.runFolder.replace(/^\\//, '')),
        stdio: 'inherit' 
      });
    }

    await runDev();
  } catch (err) {
    console.error('[Pronghorn] Fatal error:', err.message);
    process.exit(1);
  }
}

main();
`;
}

function generateReadme(deployment: any, project: any, repo: any): string {
  return `# ${deployment.environment.toUpperCase()}-${deployment.name} Local Development

This package contains everything you need to run your Pronghorn project locally.

## Quick Start

1. Install Node.js 18+ if you haven't already
2. Run the following commands:

\`\`\`bash
chmod +x start.sh
./start.sh
\`\`\`

Or manually:

\`\`\`bash
npm install
npm start
\`\`\`

## Configuration

Edit the \`.env\` file to configure:
- **PRONGHORN_SHARE_TOKEN**: Your project access token
- **APP_PORT**: The port to run on (default: 3000)
- Any additional environment variables your app needs

## Project Details

| Property | Value |
|----------|-------|
| Project | ${project?.name || 'Unknown'} |
| Environment | ${deployment.environment} |
| Branch | ${deployment.branch || 'main'} |
| Run Command | \`${deployment.run_command}\` |
| Build Command | \`${deployment.build_command || 'N/A'}\` |
${repo ? `| Repository | https://github.com/${repo.organization}/${repo.repo} |` : ''}

## Error Reporting

This runner automatically reports errors back to Pronghorn.RED for AI-assisted debugging. 
You can view and fix issues in the Deploy section of your project.

## Troubleshooting

### "Cannot find module" errors
Run \`npm install\` in the project directory.

### Git clone fails
Make sure you have access to the repository. You may need to configure Git credentials.

### Port already in use
Change the APP_PORT in your .env file.

---
Generated by Pronghorn.RED
`;
}
