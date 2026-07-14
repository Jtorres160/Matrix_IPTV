const isDev = import.meta.env ? import.meta.env.DEV : process.env.NODE_ENV === 'development';

export const logger = {
  debug: (...args) => {
    if (isDev) {
      console.debug('[DEBUG]', ...args);
    }
  },
  info: (...args) => {
    if (isDev) {
      console.info('[INFO]', ...args);
    }
  },
  warn: (...args) => {
    console.warn('[WARN]', ...args); // Warnings might be useful in production
  },
  error: (...args) => {
    console.error('[ERROR]', ...args); // Errors should always be logged
  }
};
