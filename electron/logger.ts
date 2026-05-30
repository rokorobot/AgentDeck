import fs from 'fs';
import path from 'path';
import { BrowserWindow } from 'electron';

const DATA_DIR = path.join(process.cwd(), 'data');
const logsPath = path.join(DATA_DIR, 'logs.json');

let activeMainWindow: BrowserWindow | null = null;

export function setLogWindow(window: BrowserWindow) {
  activeMainWindow = window;
}

export function addSystemLogInternal(message: string, type: 'info' | 'warning' | 'error' | 'success', workspaceId?: string) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    let logs: any[] = [];
    if (fs.existsSync(logsPath)) {
      const content = fs.readFileSync(logsPath, 'utf-8');
      try {
        logs = JSON.parse(content);
      } catch {
        logs = [];
      }
    }
    
    const fullEntry = {
      timestamp: new Date().toISOString(),
      message,
      type,
      workspaceId
    };
    logs.unshift(fullEntry);

    if (logs.length > 200) {
      logs = logs.slice(0, 200);
    }

    fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2), 'utf-8');
    
    if (activeMainWindow && !activeMainWindow.isDestroyed()) {
      activeMainWindow.webContents.send('logs:changed', fullEntry);
    }
    return fullEntry;
  } catch (error) {
    console.error('Failed to append log entry:', error);
    return null;
  }
}
