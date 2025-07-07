// Background script to manage timestamp storage
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'addTimestamps') {
    addTimestamps(message.timestamps, message.url, message.title);
  } else if (message.action === 'getTimestamps') {
    getTimestamps().then(timestamps => {
      sendResponse({ timestamps });
    });
    return true; // Will respond asynchronously
  } else if (message.action === 'clearTimestamps') {
    clearTimestamps();
  } else if (message.action === 'removeTimestamp') {
    removeTimestamp(message.id);
  } else if (message.action === 'updateTimestampLabel') {
    updateTimestampLabel(message.id, message.customLabel);
  } else if (message.action === 'broadcastFloatingWindowState') {
    broadcastFloatingWindowState(message.visible);
  }
});

async function broadcastFloatingWindowState(visible) {
  try {
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { 
        action: 'setFloatingWindowVisibility', 
        visible: visible 
      }).catch(() => {
        // Ignore errors for tabs that don't have content scripts
      });
    });
  } catch (error) {
    console.error('Error broadcasting floating window state:', error);
  }
}

async function addTimestamps(timestamps, url, title) {
  try {
    const stored = await chrome.storage.local.get(['timestampList']);
    const timestampList = stored.timestampList || [];
    
    // Add each timestamp to the list
    timestamps.forEach(timestamp => {
      const id = generateId();
      timestampList.push({
        id: id,
        original: timestamp.original,
        utc: timestamp.utc,
        type: timestamp.type,
        url: url,
        title: title,
        addedAt: new Date().toISOString()
      });
    });
    
    // Keep only the last 100 timestamps to prevent storage bloat
    const trimmedList = timestampList.slice(-100);
    
    await chrome.storage.local.set({ timestampList: trimmedList });
    
    // Notify all content scripts to update their floating windows
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: 'updateFloatingWindow' }).catch(() => {
        // Ignore errors for tabs that don't have content scripts
      });
    });
  } catch (error) {
    console.error('Error adding timestamps:', error);
  }
}

async function getTimestamps() {
  try {
    const stored = await chrome.storage.local.get(['timestampList']);
    return stored.timestampList || [];
  } catch (error) {
    console.error('Error getting timestamps:', error);
    return [];
  }
}

async function clearTimestamps() {
  try {
    await chrome.storage.local.set({ timestampList: [] });
    
    // Notify all content scripts to update their floating windows
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: 'updateFloatingWindow' }).catch(() => {
        // Ignore errors for tabs that don't have content scripts
      });
    });
  } catch (error) {
    console.error('Error clearing timestamps:', error);
  }
}

async function removeTimestamp(id) {
  try {
    const stored = await chrome.storage.local.get(['timestampList']);
    const timestampList = stored.timestampList || [];
    
    const filteredList = timestampList.filter(item => item.id !== id);
    await chrome.storage.local.set({ timestampList: filteredList });
    
    // Notify all content scripts to update their floating windows
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: 'updateFloatingWindow' }).catch(() => {
        // Ignore errors for tabs that don't have content scripts
      });
    });
  } catch (error) {
    console.error('Error removing timestamp:', error);
  }
}

async function updateTimestampLabel(id, customLabel) {
  try {
    const stored = await chrome.storage.local.get(['timestampList']);
    const timestampList = stored.timestampList || [];
    
    // Find and update the timestamp
    const timestamp = timestampList.find(item => item.id === id);
    if (timestamp) {
      if (customLabel && customLabel.trim()) {
        timestamp.customLabel = customLabel.trim();
      } else {
        // Remove custom label if empty
        delete timestamp.customLabel;
      }
      
      await chrome.storage.local.set({ timestampList: timestampList });
      
      // Notify all content scripts to update their floating windows
      const tabs = await chrome.tabs.query({});
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { action: 'updateFloatingWindow' }).catch(() => {
          // Ignore errors for tabs that don't have content scripts
        });
      });
    }
  } catch (error) {
    console.error('Error updating timestamp label:', error);
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
} 