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
  try {
    const currentDir = process.cwd();
    const rootEnvPath = path.join(currentDir, '.env');
    const distEnvPath = path.join(currentDir, 'dist', '.env');
    
    // First try standard .env loading
    dotenv.config();
    
    // If running from dist, also try parent directory
    if (currentDir.includes('dist')) {
      const parentEnvPath = path.join(currentDir, '..', '.env');
      if (fs.existsSync(parentEnvPath)) {
        dotenv.config({ path: parentEnvPath });
      }
    }
    
    // Also try explicit paths
    if (fs.existsSync(rootEnvPath)) {
      dotenv.config({ path: rootEnvPath });
    }
    
    if (fs.existsSync(distEnvPath)) {
      dotenv.config({ path: distEnvPath });
    }
    
    // Ensure dist directory has a copy of .env
    if (fs.existsSync(rootEnvPath) && !fs.existsSync(distEnvPath)) {
      try {
        // Create dist directory if it doesn't exist
        if (!fs.existsSync(path.join(currentDir, 'dist'))) {
          fs.mkdirSync(path.join(currentDir, 'dist'), { recursive: true });
        }
        fs.copyFileSync(rootEnvPath, distEnvPath);
      } catch (error) {
        console.error('Error copying .env to dist directory:', error);
        // Continue despite error
      }
    }
    
    // Check for command line argument
    const cmdApiKey = parseCommandLineArgs();
    if (cmdApiKey) {
      process.env.NASA_API_KEY = cmdApiKey;
    }
    // Explicitly set NASA_API_KEY from .env content if not already set
    else if (!process.env.NASA_API_KEY && fs.existsSync(rootEnvPath)) {
      try {
        const envContent = fs.readFileSync(rootEnvPath, 'utf8');
        const match = envContent.match(/NASA_API_KEY=([^\n]+)/);
        if (match && match[1]) {
          process.env.NASA_API_KEY = match[1].trim();
        }
      } catch (error) {
        console.error('Error reading .env file:', error);
        // Continue despite error
      }
    }
  } catch (error) {
    console.error('Error setting up environment:', error);
    // Continue despite error to allow server to try to start anyway
  }
}

// Export a default function for easy importing
export default setupEnvironment;