const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class Logger {
  constructor() {
    this.logFile = path.join(app.getPath('desktop'), 'iptv-error.log');
    
    // Ensure the file exists or can be written to
    try {
      if (!fs.existsSync(this.logFile)) {
        fs.writeFileSync(this.logFile, `=== MATRIX IPTV LOG STARTED ===\n`, 'utf8');
      }
    } catch (e) {
      console.error('Failed to initialize log file on desktop:', e);
    }
  }

  _formatMessage(level, message) {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    return `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
  }

  _write(level, message) {
    const formatted = this._formatMessage(level, message);
    try {
      fs.appendFileSync(this.logFile, formatted, 'utf8');
      // Also log to terminal
      if (level === 'error') {
        console.error(formatted.trim());
      } else if (level === 'warn') {
        console.warn(formatted.trim());
      } else {
        console.log(formatted.trim());
      }
    } catch (e) {
      console.error('Failed to write to log file:', e);
    }
  }

  info(message) {
    this._write('info', message);
  }

  warn(message) {
    this._write('warn', message);
  }

  error(message, errorObj = null) {
    let fullMessage = message;
    if (errorObj) {
      if (errorObj.stack) {
        fullMessage += `\n${errorObj.stack}`;
      } else {
        fullMessage += `\n${JSON.stringify(errorObj)}`;
      }
    }
    this._write('error', fullMessage);
  }

  logMemory(context = 'Memory Snapshot') {
    const mem = process.memoryUsage();
    const toMB = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
    
    const msg = `${context} - RSS: ${toMB(mem.rss)}, Heap: ${toMB(mem.heapUsed)} / ${toMB(mem.heapTotal)}, External: ${toMB(mem.external)}`;
    this.info(msg);
  }
}

module.exports = new Logger();
