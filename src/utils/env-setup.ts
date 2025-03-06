import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

/**
 * Parse command line arguments for NASA API key
 * Looks for --nasa-api-key=value or --nasa-api-key value
 */
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  
  for (let i = 0; i < args.length; i++) {
    // Check for --nasa-api-key=value format
    if (args[i].startsWith('--nasa-api-key=')) {
      return args[i].split('=')[1];
    }
    
    // Check for --nasa-api-key value format
    if (args[i] === '--nasa-api-key' && i + 1 < args.length) {
      return args[i + 1];
    }
  }
  
  return null;
}

/**
 * Ensures that environment variables are properly loaded from .env files
 * This function will:
 * 1. Try to load from .env in current directory
 * 2. Try to load from .env in parent directory
 * 3. Try to load from .env in dist directory
 * 4. Copy the .env file to ensure it's available where needed
 * 5. Check for command line arguments
 */
export function setupEnvironment() {
  const currentDir = process.cwd();
  const rootEnvPath = path.join(currentDir, '.env');
  const distEnvPath = path.join(currentDir, 'dist', '.env');
  
  console.log('Setting up environment...');
  console.log('Current directory:', currentDir);
  
  // First try standard .env loading
  dotenv.config();
  
  // If running from dist, also try parent directory
  if (currentDir.includes('dist')) {
    console.log('Running from dist directory, trying parent .env');
    const parentEnvPath = path.join(currentDir, '..', '.env');
    if (fs.existsSync(parentEnvPath)) {
      console.log('Found .env in parent directory, loading...');
      dotenv.config({ path: parentEnvPath });
    }
  }
  
  // Also try explicit paths
  if (fs.existsSync(rootEnvPath)) {
    console.log('Found .env in root directory, loading...');
    dotenv.config({ path: rootEnvPath });
  }
  
  if (fs.existsSync(distEnvPath)) {
    console.log('Found .env in dist directory, loading...');
    dotenv.config({ path: distEnvPath });
  }
  
  // Ensure dist directory has a copy of .env
  if (fs.existsSync(rootEnvPath) && !fs.existsSync(distEnvPath)) {
    try {
      // Create dist directory if it doesn't exist
      if (!fs.existsSync(path.join(currentDir, 'dist'))) {
        fs.mkdirSync(path.join(currentDir, 'dist'), { recursive: true });
      }
      console.log('Copying .env to dist directory...');
      fs.copyFileSync(rootEnvPath, distEnvPath);
    } catch (error) {
      console.error('Error copying .env to dist directory:', error);
    }
  }
  
  // Check for command line argument
  const cmdApiKey = parseCommandLineArgs();
  if (cmdApiKey) {
    console.log('NASA_API_KEY found in command line arguments');
    process.env.NASA_API_KEY = cmdApiKey;
  }
  // Explicitly set NASA_API_KEY from .env content if not already set
  else if (!process.env.NASA_API_KEY && fs.existsSync(rootEnvPath)) {
    try {
      const envContent = fs.readFileSync(rootEnvPath, 'utf8');
      const match = envContent.match(/NASA_API_KEY=([^\n]+)/);
      if (match && match[1]) {
        console.log('Setting NASA_API_KEY from .env content...');
        process.env.NASA_API_KEY = match[1].trim();
      }
    } catch (error) {
      console.error('Error reading .env file:', error);
    }
  }
  
  // Log status
  console.log('NASA_API_KEY set:', !!process.env.NASA_API_KEY);
  if (process.env.NASA_API_KEY) {
    console.log('NASA_API_KEY value (first 5 chars):', process.env.NASA_API_KEY.substring(0, 5) + '...');
  }
}

// Export a default function for easy importing
export default setupEnvironment;