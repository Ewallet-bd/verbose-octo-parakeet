import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SESSION_FILE = path.join(DATA_DIR, 'automation-storage-state.json');
const CONFIG_FILE = path.join(DATA_DIR, 'automation-config.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create data directory:', err);
  }
}

export function getSessionFilePath(): string {
  return SESSION_FILE;
}

export function hasStoredSession(): boolean {
  try {
    if (!fs.existsSync(SESSION_FILE)) return false;
    const stat = fs.statSync(SESSION_FILE);
    if (stat.size < 10) return false;
    // Check if file is readable and valid JSON
    const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    return Array.isArray(data.cookies) && data.cookies.length > 0;
  } catch {
    return false;
  }
}

export function clearStoredSession(): boolean {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      fs.unlinkSync(SESSION_FILE);
      return true;
    }
    return false;
  } catch (err) {
    console.error('Failed to clear stored session:', err);
    return false;
  }
}

export function loadSavedConfig(): any | null {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return data;
    }
  } catch (err) {
    console.error('Failed to load saved automation config:', err);
  }
  return null;
}

export function saveConfigToFile(config: any): boolean {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to save automation config:', err);
    return false;
  }
}
