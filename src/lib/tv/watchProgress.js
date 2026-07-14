const STORAGE_KEY = 'matrix_iptv_watch_progress';

const getStore = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    return {};
  }
};

const saveStore = (data) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save watch progress', e);
  }
};

export const saveProgress = (id, { positionSeconds, durationSeconds, timestamp, completed }) => {
  if (!id) return;
  const store = getStore();
  store[id] = {
    ...store[id],
    positionSeconds: positionSeconds || 0,
    durationSeconds: durationSeconds || 0,
    timestamp: timestamp || Date.now(),
    completed: !!completed
  };
  saveStore(store);
};

export const getProgress = (id) => {
  if (!id) return null;
  const store = getStore();
  return store[id] || null;
};

export const isResumeEligible = (id) => {
  const progress = getProgress(id);
  if (!progress) return false;
  
  if (progress.completed) return false;
  
  return true;
};
