#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Path to .env file
const envPath = path.resolve(process.cwd(), '.env');

// Function to parse .env file and return array of env vars
function parseEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn('.env file not found at:', filePath);
      return [];
    }

    const envContent = fs.readFileSync(filePath, 'utf8');
    const envVars = [];

    // Split by lines and process each line
    envContent.split('\n').forEach(line => {
      // Skip comments and empty lines
      if (!line || line.trim().startsWith('#')) {
        return;
      }

      // Find the first equals sign (to handle values that contain = signs)
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex).trim();
        const value = line.substring(eqIndex + 1).trim();
        
        if (key && value) {
          envVars.push({ key, value });
        }
      }
    });

    return envVars;
  } catch (error) {
    console.error('Error parsing .env file:', error.message);
    return [];
  }
}

// Get environment variables from .env
const envVars = parseEnvFile(envPath);

if (envVars.length === 0) {
  console.warn('No environment variables found in .env file.');
}

// Command to run
const command = 'node';
const args = [];

// Add any additional command line arguments
const scriptArgs = process.argv.slice(2);

// Prepare the environment for the child process
const env = { ...process.env };
envVars.forEach(({ key, value }) => {
  env[key] = value;
});

// Add default command if none provided
if (scriptArgs.length === 0) {
  args.push('dist/index.js');
  args.push('--transport=stdio');
} else {
  args.push(...scriptArgs);
}

console.log(`Running: ${command} ${args.join(' ')} with environment variables`);
console.log(`Environment variables: ${envVars.map(v => `${v.key}=${v.value}`).join(', ')}`);

// Spawn the process
const child = spawn(command, args, { 
  stdio: 'inherit',
  env: env
});

// Handle process events
child.on('close', (code) => {
  process.exit(code);
}); 