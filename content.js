// Content script to detect timestamp selections
let floatingWindow = null;
let isFloatingWindowVisible = false;
let timestamps = [];

// Initialize floating window when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeFloatingWindow);
} else {
  initializeFloatingWindow();
}

document.addEventListener('mouseup', function() {
  const selectedText = window.getSelection().toString().trim();
  
  if (selectedText && selectedText.length > 0) {
    const timestamps = extractTimestamps(selectedText);
    
    if (timestamps.length > 0) {
      // Send timestamps to background script
      chrome.runtime.sendMessage({
        action: 'addTimestamps',
        timestamps: timestamps,
        url: window.location.href,
        title: document.title
      });
      
      // Show visual feedback
      showTimestampDetectedFeedback();
      
      // Update floating window
      updateFloatingWindow();
    }
  }
});

function extractTimestamps(text) {
  const timestamps = [];
  const matchedRanges = []; // Track which parts of text have been matched
  
  // Unix timestamp patterns (10 digits for seconds, 13 digits for milliseconds)
  const unixPatterns = [
    /\b(\d{10})\b/g,          // Unix timestamp in seconds
    /\b(\d{13})\b/g,          // Unix timestamp in milliseconds
  ];
  
  // ISO 8601 and common date formats
  const datePatterns = [
    /\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?)\b/g,  // ISO 8601
    /\b(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\b/g,                // YYYY-MM-DD HH:MM:SS
    /\b(\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2})\b/g,        // MM/DD/YYYY HH:MM:SS
    /\b(\d{1,2}-\d{1,2}-\d{4} \d{1,2}:\d{2}:\d{2})\b/g,          // MM-DD-YYYY HH:MM:SS
  ];

  // Date + time patterns with AM/PM and timezones (only with timezone info)
  // Process these BEFORE time patterns to avoid substring matching
  const dateTimePatterns = [
    // Month name formats (Apr 29, 2024 7:30 AM CDT)
    /\b([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}\s+\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
    /\b([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
    /\b(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s+\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
    /\b(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
    // Numeric formats
    /\b(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
    /\b(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
    /\b(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
    /\b(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
  ];

  // Time patterns with AM/PM and timezones (only with timezone info)
  // Order matters: longer patterns first to prevent substring matching
  const timePatterns = [
    /\b(\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,  // 4:00:00 PM EDT
    /\b(\d{1,2}:\d{2}:\d{2}\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,  // 16:00:00 EDT
    /\b(\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,         // 4:00 PM EDT
    /\b(\d{1,2}:\d{2}\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,         // 16:00 EDT
  ];
  
  // Helper function to check if a range overlaps with existing matches
  function isOverlapping(start, end) {
    return matchedRanges.some(range => 
      (start >= range.start && start < range.end) || 
      (end > range.start && end <= range.end) ||
      (start <= range.start && end >= range.end)
    );
  }
  
  // Helper function to add a match if it doesn't overlap
  function addMatch(match, utcDate, type) {
    const start = match.index;
    const end = match.index + match[0].length;
    
    if (!isOverlapping(start, end)) {
      matchedRanges.push({ start, end });
      timestamps.push({
        original: match[1],
        utc: utcDate,
        type: type
      });
    }
  }
  
  // Check for Unix timestamps
  unixPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const timestamp = match[1];
      const utcDate = convertUnixToUTC(timestamp);
      
      if (utcDate) {
        addMatch(match, utcDate, 'unix');
      }
    }
  });
  
  // Check for date formats
  datePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const dateStr = match[1];
      const utcDate = convertDateToUTC(dateStr);
      
      if (utcDate) {
        addMatch(match, utcDate, 'date');
      }
    }
  });

  // Check for date + time formats with AM/PM and timezones FIRST
  dateTimePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const dateTimeStr = match[1];
      const utcDate = convertDateToUTC(dateTimeStr);
      
      if (utcDate) {
        addMatch(match, utcDate, 'datetime');
      }
    }
  });

  // Check for time formats with AM/PM and timezones AFTER dateTime
  timePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const timeStr = match[1];
      const utcDate = convertTimeToUTC(timeStr);
      
      if (utcDate) {
        addMatch(match, utcDate, 'time');
      }
    }
  });
  
  return timestamps;
}

function convertUnixToUTC(timestamp) {
  try {
    let ts = parseInt(timestamp);
    
    // Convert to milliseconds if it's in seconds
    if (timestamp.length === 10) {
      ts = ts * 1000;
    }
    
    // Validate timestamp range (reasonable dates)
    if (ts < 0 || ts > Date.now() + 31536000000) { // Not more than 1 year in future
      return null;
    }
    
    const date = new Date(ts);
    return date.toISOString();
  } catch (error) {
    return null;
  }
}

function convertDateToUTC(dateStr) {
  try {
    // Handle timezone abbreviations
    const processedDateStr = handleTimezoneAbbreviations(dateStr);
    const date = new Date(processedDateStr);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return null;
    }
    
    return date.toISOString();
  } catch (error) {
    return null;
  }
}

function convertTimeToUTC(timeStr) {
  try {
    // For time-only formats, use today's date as reference
    const today = new Date();
    const todayDateStr = today.toISOString().split('T')[0]; // Get YYYY-MM-DD
    const fullDateTimeStr = `${todayDateStr} ${timeStr}`;
    
    // Handle timezone abbreviations
    const processedDateStr = handleTimezoneAbbreviations(fullDateTimeStr);
    const parsedDate = new Date(processedDateStr);
    
    if (isNaN(parsedDate.getTime())) {
      return null;
    }
    
    // Get UTC date components
    const utcDateStr = parsedDate.toISOString().split('T')[0];
    const utcTimeStr = parsedDate.toISOString().split('T')[1];
    
    // Compare local date (today) with UTC date
    const label = utcDateStr === todayDateStr ? 'Same day' : 'Next day';
    
    // Return relative format: "Same day 21:00:00.000Z", "Next day 05:30:00.000Z", etc.
    return `${label} ${utcTimeStr}`;
  } catch (error) {
    return null;
  }
}

function handleTimezoneAbbreviations(dateTimeStr) {
  // Map of timezone abbreviations to UTC offsets
  const timezoneMap = {
    'EST': '-0500',  // Eastern Standard Time
    'EDT': '-0400',  // Eastern Daylight Time
    'CST': '-0600',  // Central Standard Time
    'CDT': '-0500',  // Central Daylight Time
    'MST': '-0700',  // Mountain Standard Time
    'MDT': '-0600',  // Mountain Daylight Time
    'PST': '-0800',  // Pacific Standard Time
    'PDT': '-0700',  // Pacific Daylight Time
    'UTC': '+0000',  // Coordinated Universal Time
    'GMT': '+0000'   // Greenwich Mean Time
  };
  
  let processedStr = dateTimeStr;
  
  // Find and replace timezone abbreviations
  for (const [abbr, offset] of Object.entries(timezoneMap)) {
    const regex = new RegExp(`\\s*${abbr}\\s*$`, 'i');
    if (regex.test(processedStr)) {
      processedStr = processedStr.replace(regex, ` ${offset}`);
      break;
    }
  }
  
  return processedStr;
}

function showTimestampDetectedFeedback() {
  // Create a temporary notification
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 10px 15px;
    border-radius: 5px;
    font-size: 14px;
    z-index: 10000;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    font-family: Arial, sans-serif;
  `;
  notification.textContent = 'Timestamp detected and converted!';
  
  document.body.appendChild(notification);
  
  // Remove notification after 2 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 2000);
}

// Floating window functionality
function initializeFloatingWindow() {
  try {
    // Load saved state with better error handling
    chrome.storage.local.get(['floatingWindowVisible', 'floatingWindowPosition']).then(result => {
      isFloatingWindowVisible = result.floatingWindowVisible === true; // Explicit boolean check
      const position = result.floatingWindowPosition || { top: 20, right: 20 };
      
      createFloatingWindow(position);
      
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        if (isFloatingWindowVisible) {
          showFloatingWindow();
        }
        
        // Load initial timestamps
        updateFloatingWindow();
      }, 100);
    }).catch(error => {
      console.error('Error loading floating window state:', error);
      // Fallback: create window in default state
      createFloatingWindow({ top: 20, right: 20 });
      updateFloatingWindow();
    });

    // Listen for keyboard shortcut (Cmd+Shift+F on Mac, Ctrl+Alt+T on Windows/Linux)
    const keydownHandler = function(e) {
      // Check for Cmd+Shift+F (Mac) or Ctrl+Alt+T (Windows/Linux)
      const isMacShortcut = e.metaKey && e.shiftKey && (e.key === 'F' || e.key === 'f' || e.code === 'KeyF');
      const isWinShortcut = e.ctrlKey && e.altKey && (e.key === 'T' || e.key === 't' || e.code === 'KeyT');
      
      if (isMacShortcut || isWinShortcut) {
        e.preventDefault();
        e.stopPropagation();
        toggleFloatingWindow();
      }
    };
    
    document.addEventListener('keydown', keydownHandler, true);
  } catch (error) {
    console.error('Error in initializeFloatingWindow:', error);
  }
}

function createFloatingWindow(position) {
  try {
    if (floatingWindow) {
      return;
    }
    
    floatingWindow = document.createElement('div');
  floatingWindow.id = 'hoottime-floating';
  floatingWindow.style.cssText = `
    position: fixed;
    top: ${position.top}px;
    right: ${position.right}px;
    width: 350px;
    height: 400px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    display: none;
    overflow: hidden;
  `;
  
  floatingWindow.innerHTML = `
    <div class="floating-header" style="
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px;
      cursor: move;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
    ">
      <span style="font-weight: 600; font-size: 16px;">HootTime</span>
      <div>
        <button id="floating-minimize" style="
          background: none;
          border: none;
          color: white;
          font-size: 16px;
          cursor: pointer;
          padding: 4px;
          margin-right: 4px;
        ">−</button>
        <button id="floating-close" style="
          background: none;
          border: none;
          color: white;
          font-size: 16px;
          cursor: pointer;
          padding: 4px;
        ">×</button>
      </div>
    </div>
    <div class="floating-content" style="
      padding: 12px;
      max-height: 340px;
      overflow-y: auto;
    ">
      <div class="floating-converter" style="
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid #e9ecef;
      ">
        <div style="
          display: flex;
          gap: 8px;
          margin-bottom: 4px;
        ">
          <input type="text" id="floating-manual-timestamp" placeholder="Enter timestamp..." style="
            flex: 1;
            padding: 6px 8px;
            border: 1px solid #ced4da;
            border-radius: 4px;
            font-size: 12px;
            font-family: inherit;
          ">
          <button id="floating-convert-btn" style="
            background: #667eea;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
          ">Add</button>
          <button id="floating-clear-all-btn" style="
            background: #dc3545;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
          ">Clear All</button>
        </div>
      </div>
      <div class="loading-message" style="text-align: center; color: #666; padding: 20px;">
        Loading timestamps...
      </div>
    </div>
    <div class="resize-handle" style="
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 8px;
      background: transparent;
      cursor: ns-resize;
      border-bottom-left-radius: 8px;
      border-bottom-right-radius: 8px;
    ">
      <div style="
        position: absolute;
        bottom: 2px;
        left: 50%;
        transform: translateX(-50%);
        width: 30px;
        height: 3px;
        background: #cbd5e0;
        border-radius: 2px;
      "></div>
    </div>
  `;
  
  document.body.appendChild(floatingWindow);
  
  // Make draggable
  makeDraggable(floatingWindow);
  
  // Add event listeners
  floatingWindow.querySelector('#floating-close').addEventListener('click', function() {
    hideFloatingWindow();
    // Save state and notify all tabs
    chrome.storage.local.set({ floatingWindowVisible: false });
    chrome.runtime.sendMessage({ 
      action: 'broadcastFloatingWindowState', 
      visible: false 
    });
  });
  
  floatingWindow.querySelector('#floating-minimize').addEventListener('click', function() {
    hideFloatingWindow();
    // Save state and notify all tabs
    chrome.storage.local.set({ floatingWindowVisible: false });
    chrome.runtime.sendMessage({ 
      action: 'broadcastFloatingWindowState', 
      visible: false 
    });
  });
  
  // Add converter functionality to floating window
  const floatingInput = floatingWindow.querySelector('#floating-manual-timestamp');
  const floatingConvertBtn = floatingWindow.querySelector('#floating-convert-btn');
  
  floatingConvertBtn.addEventListener('click', function() {
    convertFloatingTimestamp();
  });
  
  floatingInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      convertFloatingTimestamp();
    }
  });

  // Add clear all functionality
  const floatingClearAllBtn = floatingWindow.querySelector('#floating-clear-all-btn');
  floatingClearAllBtn.addEventListener('click', function() {
    clearAllTimestamps();
  });
  
  // Add resize functionality
  const resizeHandle = floatingWindow.querySelector('.resize-handle');
  let isResizing = false;
  let startY = 0;
  let startHeight = 0;
  
  resizeHandle.addEventListener('mousedown', function(e) {
    isResizing = true;
    startY = e.clientY;
    startHeight = floatingWindow.offsetHeight;
    e.preventDefault();
    
    // Add temporary styles to prevent text selection during resize
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';
  });
  
  document.addEventListener('mousemove', function(e) {
    if (!isResizing) return;
    
    const deltaY = e.clientY - startY;
    const maxHeight = Math.min(window.innerHeight - 100, 1000); // Max 1000px or window height - 100px
    const newHeight = Math.max(200, Math.min(maxHeight, startHeight + deltaY)); // Min 200px, max dynamic
    
    floatingWindow.style.height = newHeight + 'px';
    
    // Update content max-height to account for header and padding
    const content = floatingWindow.querySelector('.floating-content');
    content.style.maxHeight = (newHeight - 60) + 'px'; // 60px for header + padding
    
    e.preventDefault();
  });
  
  document.addEventListener('mouseup', function() {
    if (isResizing) {
      isResizing = false;
      
      // Remove temporary styles
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      
      // Save the new height
      const height = floatingWindow.offsetHeight;
      chrome.storage.local.set({ floatingWindowHeight: height });
    }
  });
  } catch (error) {
    console.error('Error in createFloatingWindow:', error);
  }
}

function makeDraggable(element) {
  let isDragging = false;
  let startX, startY, startLeft, startTop;
  
  const header = element.querySelector('.floating-header');
  
  header.addEventListener('mousedown', function(e) {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = parseInt(window.getComputedStyle(element).left);
    startTop = parseInt(window.getComputedStyle(element).top);
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  });
  
  function handleMouseMove(e) {
    if (!isDragging) return;
    
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    const newLeft = startLeft + deltaX;
    const newTop = startTop + deltaY;
    
    // Keep within viewport
    const maxLeft = window.innerWidth - element.offsetWidth;
    const maxTop = window.innerHeight - element.offsetHeight;
    
    element.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
    element.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
    element.style.right = 'auto';
  }
  
  function handleMouseUp() {
    isDragging = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    
    // Save position
    const rect = element.getBoundingClientRect();
    chrome.storage.local.set({
      floatingWindowPosition: {
        top: rect.top,
        right: window.innerWidth - rect.right
      }
    });
  }
}

async function showFloatingWindow() {
  try {
    if (floatingWindow) {
      floatingWindow.style.display = 'block';
      isFloatingWindowVisible = true;
      
      // Restore saved height
      try {
        const result = await chrome.storage.local.get(['floatingWindowHeight']);
        if (result.floatingWindowHeight) {
          const height = result.floatingWindowHeight;
          floatingWindow.style.height = height + 'px';
          
          // Update content max-height to match
          const content = floatingWindow.querySelector('.floating-content');
          if (content) {
            content.style.maxHeight = (height - 60) + 'px'; // 60px for header + padding
          }
        }
      } catch (error) {
        console.error('Error restoring floating window height:', error);
      }
    }
  } catch (error) {
    console.error('Error in showFloatingWindow:', error);
  }
}

function hideFloatingWindow() {
  try {
    if (floatingWindow) {
      floatingWindow.style.display = 'none';
      isFloatingWindowVisible = false;
    }
  } catch (error) {
    console.error('Error in hideFloatingWindow:', error);
  }
}

async function toggleFloatingWindow() {
  try {
    const newVisibility = !isFloatingWindowVisible;
    
    if (newVisibility) {
      await showFloatingWindow();
    } else {
      hideFloatingWindow();
    }
    
    // Save state and notify all tabs
    chrome.storage.local.set({ floatingWindowVisible: newVisibility });
    chrome.runtime.sendMessage({ 
      action: 'broadcastFloatingWindowState', 
      visible: newVisibility 
    });
  } catch (error) {
    console.error('Error in toggleFloatingWindow:', error);
  }
}

function updateFloatingWindow() {
  if (!floatingWindow) return;
  
  // Get latest timestamps
  chrome.runtime.sendMessage({ action: 'getTimestamps' }, response => {
    if (response && response.timestamps) {
      timestamps = response.timestamps;
      renderFloatingTimestamps();
    }
  });
}

function renderFloatingTimestamps() {
  if (!floatingWindow) return;
  
  const content = floatingWindow.querySelector('.floating-content');
  
  // Get the converter section to preserve it
  const converterSection = content.querySelector('.floating-converter');
  
  if (timestamps.length === 0) {
    content.innerHTML = `
      <div class="floating-converter" style="
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid #e9ecef;
      ">
        <div style="
          display: flex;
          gap: 8px;
          margin-bottom: 4px;
        ">
          <input type="text" id="floating-manual-timestamp" placeholder="Enter timestamp..." style="
            flex: 1;
            padding: 6px 8px;
            border: 1px solid #ced4da;
            border-radius: 4px;
            font-size: 12px;
            font-family: inherit;
          ">
          <button id="floating-convert-btn" style="
            background: #667eea;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
          ">Add</button>
        <button id="floating-clear-all-btn" style="
          background: #dc3545;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
        ">Clear All</button>
        </div>
      </div>
      <div style="text-align: center; color: #666; padding: 16px;">
        <p>No timestamps yet</p>
        <p style="font-size: 12px;">Highlight text with timestamps to get started</p>
        <p style="font-size: 12px; margin-top: 8px;">Press <strong>⌘+Shift+F</strong> (Mac) or <strong>Ctrl+Alt+T</strong> (PC) to toggle this window</p>
        <p style="font-size: 11px; margin-top: 8px; color: #999;">💡 Tip: Click time labels to edit them, × to remove</p>
      </div>
    `;
    
    // Re-attach event listeners
    reattachFloatingConverterListeners();
    return;
  }
  
  // Sort by most recent first
  const sortedTimestamps = timestamps.sort((a, b) => 
    new Date(b.addedAt) - new Date(a.addedAt)
  );
  
  // Dedupe by UTC timestamp, keeping the most recent occurrence
  const deduped = [];
  const seenUTC = new Set();
  
  for (const timestamp of sortedTimestamps) {
    if (!seenUTC.has(timestamp.utc)) {
      seenUTC.add(timestamp.utc);
      deduped.push(timestamp);
    }
  }
  
  const timestampHTML = deduped.slice(0, 10).map(timestamp => {
    const timeAgo = getTimeAgo(new Date(timestamp.addedAt));
    return `
      <div style="
        border: 1px solid #e9ecef;
        border-radius: 6px;
        padding: 6px;
        margin-bottom: 4px;
        background: #f8f9fa;
      ">
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        ">
          <span style="
            font-family: Monaco, monospace;
            font-size: 11px;
            color: #666;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            flex: 1;
            margin-right: 8px;
          ">
            ${escapeHtml(timestamp.original)}
          </span>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="time-label" data-id="${timestamp.id}" style="color: #999; font-size: 10px; flex-shrink: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; cursor: pointer; text-decoration: underline; text-decoration-style: dotted;" title="Click to edit label">
              ${timestamp.customLabel || timeAgo}
            </span>
            <button class="remove-timestamp" data-id="${timestamp.id}" style="
              background: #dc3545;
              color: white;
              border: none;
              border-radius: 3px;
              width: 16px;
              height: 16px;
              font-size: 10px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
              opacity: 0.7;
              transition: opacity 0.2s;
            " title="Remove timestamp" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">×</button>
          </div>
        </div>
        <div class="utc-timestamp" data-utc="${timestamp.utc}" style="
          font-family: Monaco, monospace;
          font-size: 11px;
          color: #2d5a2d;
          font-weight: 500;
          background: #e8f5e8;
          padding: 4px;
          border-radius: 3px;
          cursor: pointer;
          transition: background-color 0.2s;
        " onmouseover="this.style.backgroundColor='#d4edda'" onmouseout="this.style.backgroundColor='#e8f5e8'">
          ${timestamp.utc}
        </div>
      </div>
    `;
  }).join('');
  
  // Combine converter section with timestamps
  content.innerHTML = `
    <div class="floating-converter" style="
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e9ecef;
    ">
      <div style="
        display: flex;
        gap: 8px;
        margin-bottom: 4px;
      ">
        <input type="text" id="floating-manual-timestamp" placeholder="Enter timestamp..." style="
          flex: 1;
          padding: 6px 8px;
          border: 1px solid #ced4da;
          border-radius: 4px;
          font-size: 12px;
          font-family: inherit;
        ">
        <button id="floating-convert-btn" style="
          background: #667eea;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
                  ">Add</button>
          <button id="floating-clear-all-btn" style="
            background: #dc3545;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
          ">Clear All</button>
        </div>
      </div>
      ${timestampHTML}
  `;
  
  // Re-attach event listeners
  reattachFloatingConverterListeners();
  
  // Add copy functionality for UTC timestamps
  attachCopyListeners();
}

function attachCopyListeners() {
  // Remove existing listeners to prevent duplicates
  const existingTimestamps = floatingWindow.querySelectorAll('.utc-timestamp');
  existingTimestamps.forEach(element => {
    element.removeEventListener('click', handleTimestampClick);
  });
  
  const existingLabels = floatingWindow.querySelectorAll('.time-label');
  existingLabels.forEach(element => {
    element.removeEventListener('click', handleLabelClick);
  });
  
  const existingRemoveButtons = floatingWindow.querySelectorAll('.remove-timestamp');
  existingRemoveButtons.forEach(element => {
    element.removeEventListener('click', handleRemoveClick);
  });
  
  // Add new listeners
  const utcTimestamps = floatingWindow.querySelectorAll('.utc-timestamp');
  utcTimestamps.forEach(element => {
    element.addEventListener('click', handleTimestampClick);
  });
  
  const timeLabels = floatingWindow.querySelectorAll('.time-label');
  timeLabels.forEach(element => {
    element.addEventListener('click', handleLabelClick);
  });
  
  const removeButtons = floatingWindow.querySelectorAll('.remove-timestamp');
  removeButtons.forEach(element => {
    element.addEventListener('click', handleRemoveClick);
  });
}

function handleTimestampClick(event) {
  const element = event.target;
  const text = element.getAttribute('data-utc');
  
  if (!text) return;
  
  // Try multiple methods to copy to clipboard
  copyToClipboard(text, element);
}

function handleLabelClick(event) {
  const element = event.target;
  const id = element.getAttribute('data-id');
  const currentText = element.textContent;
  
  if (!id) return;
  
  // Create input field
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentText;
  input.style.cssText = `
    color: #999;
    font-size: 10px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: white;
    border: 1px solid #ccc;
    border-radius: 3px;
    padding: 2px 4px;
    width: 80px;
    text-align: center;
  `;
  
  // Replace the span with input
  element.parentNode.replaceChild(input, element);
  input.focus();
  input.select();
  
  // Save on Enter
  const saveLabel = async () => {
    const newLabel = input.value.trim();
    
    try {
      // Update timestamp with custom label
      await chrome.runtime.sendMessage({
        action: 'updateTimestampLabel',
        id: id,
        customLabel: newLabel
      });
      
      // Refresh the floating window
      updateFloatingWindow();
      
    } catch (error) {
      console.error('Error saving label:', error);
      // Restore original element on error
      input.parentNode.replaceChild(element, input);
    }
  };
  
  // Cancel on Escape
  const cancelEdit = () => {
    // Restore original element
    input.parentNode.replaceChild(element, input);
  };
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveLabel();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  });
  
  // Only save on blur if the input still has content and hasn't been cancelled
  input.addEventListener('blur', (e) => {
    // Add a small delay to check if user is clicking away intentionally
    setTimeout(() => {
      if (input.parentNode) { // Check if input still exists (not cancelled)
        saveLabel();
      }
    }, 100);
  });
}

function handleRemoveClick(event) {
  event.stopPropagation(); // Prevent triggering other click events
  
  const element = event.target;
  const id = element.getAttribute('data-id');
  
  if (!id) return;
  
  // Show confirmation
  if (confirm('Remove this timestamp?')) {
    // Send remove request to background script
    chrome.runtime.sendMessage({
      action: 'removeTimestamp',
      id: id
    }).then(() => {
      // Update floating window
      updateFloatingWindow();
      
      // Show success feedback
      showFloatingMessage('Timestamp removed', '#28a745');
    }).catch(error => {
      console.error('Error removing timestamp:', error);
      showFloatingMessage('Failed to remove', '#dc3545');
    });
  }
}

function copyToClipboard(text, element) {
  // Method 1: Try navigator.clipboard (modern browsers)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showCopySuccess(text, element);
    }).catch(err => {
      console.warn('Clipboard API failed, trying fallback method:', err);
      fallbackCopy(text, element);
    });
  } else {
    // Method 2: Fallback method
    fallbackCopy(text, element);
  }
}

function fallbackCopy(text, element) {
  try {
    // Create a temporary textarea element
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    
    // Select and copy
    textarea.select();
    textarea.setSelectionRange(0, 99999); // For mobile devices
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    
    if (successful) {
      showCopySuccess(text, element);
    } else {
      showCopyError(element);
    }
  } catch (err) {
    console.error('All copy methods failed:', err);
    showCopyError(element);
  }
}

function showCopySuccess(text, element) {
  // Visual feedback on the element
  const originalBg = element.style.background;
  const originalColor = element.style.color;
  element.style.background = '#d4edda';
  element.style.color = '#155724';
  
  setTimeout(() => {
    element.style.background = originalBg;
    element.style.color = originalColor;
  }, 1000);
  
  // Show toast notification
  showCopyToast(text);
}

function showCopyError(element) {
  // Visual feedback on the element
  const originalBg = element.style.background;
  const originalColor = element.style.color;
  element.style.background = '#f8d7da';
  element.style.color = '#721c24';
  
  setTimeout(() => {
    element.style.background = originalBg;
    element.style.color = originalColor;
  }, 1000);
  
  // Show error toast
  showCopyToast('Failed to copy', true);
}

function showCopyToast(text, isError = false) {
  // Create toast notification
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${isError ? '#dc3545' : '#28a745'};
    color: white;
    padding: 12px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    z-index: 10003;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    max-width: 300px;
    word-break: break-all;
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s ease;
  `;
  
  if (isError) {
    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">❌</span>
        <span>Failed to copy timestamp</span>
      </div>
    `;
  } else {
    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">✅</span>
        <div>
          <div style="font-weight: 600; margin-bottom: 2px;">Copied to clipboard!</div>
          <div style="font-size: 12px; opacity: 0.9; font-family: Monaco, monospace;">${text}</div>
        </div>
      </div>
    `;
  }
  
  document.body.appendChild(toast);
  
  // Animate in
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
  }, 50);
  
  // Animate out and remove
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

function reattachFloatingConverterListeners() {
  const floatingInput = floatingWindow.querySelector('#floating-manual-timestamp');
  const floatingConvertBtn = floatingWindow.querySelector('#floating-convert-btn');
  const floatingClearAllBtn = floatingWindow.querySelector('#floating-clear-all-btn');
  
  if (floatingInput && floatingConvertBtn) {
    floatingConvertBtn.addEventListener('click', function() {
      convertFloatingTimestamp();
    });
    
    floatingInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        convertFloatingTimestamp();
      }
    });
  }
  
  if (floatingClearAllBtn) {
    floatingClearAllBtn.addEventListener('click', function() {
      clearAllTimestamps();
    });
  }
  
  // Also reattach copy listeners
  attachCopyListeners();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getTimeAgo(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return 'Now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
  return `${Math.floor(diffInSeconds / 86400)}d`;
}

function convertFloatingTimestamp() {
  const floatingInput = floatingWindow.querySelector('#floating-manual-timestamp');
  const input = floatingInput.value.trim();
  
  if (!input) {
    showFloatingError('Please enter a timestamp');
    return;
  }
  
  try {
    const timestamps = extractTimestampsFromText(input);
    
    if (timestamps.length === 0) {
      showFloatingError('No valid timestamp format detected');
      return;
    }
    
    // Send to background script to add to storage
    chrome.runtime.sendMessage({
      action: 'addTimestamps',
      timestamps: timestamps,
      url: window.location.href,
      title: 'Floating Window Entry'
    });
    
    // Clear input and show success
    floatingInput.value = '';
    showFloatingSuccess(`Added ${timestamps.length} timestamp${timestamps.length > 1 ? 's' : ''}`);
    
    // Update floating window display
    setTimeout(() => {
      updateFloatingWindow();
    }, 500);
    
  } catch (error) {
    console.error('Error converting floating timestamp:', error);
    showFloatingError('Error converting timestamp');
  }
}

function extractTimestampsFromText(text) {
  const timestamps = [];
  const matchedRanges = []; // Track which parts of text have been matched
  
  // Unix timestamp patterns (10 digits for seconds, 13 digits for milliseconds)
  const unixPatterns = [
    /\b(\d{10})\b/g,          // Unix timestamp in seconds
    /\b(\d{13})\b/g,          // Unix timestamp in milliseconds
  ];
  
  // ISO 8601 and common date formats
  const datePatterns = [
    /\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?)\b/g,  // ISO 8601
    /\b(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\b/g,                // YYYY-MM-DD HH:MM:SS
    /\b(\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2})\b/g,        // MM/DD/YYYY HH:MM:SS
    /\b(\d{1,2}-\d{1,2}-\d{4} \d{1,2}:\d{2}:\d{2})\b/g,          // MM-DD-YYYY HH:MM:SS
  ];

  // Date + time patterns with AM/PM and timezones (only with timezone info)
  // Process these BEFORE time patterns to avoid substring matching
  const dateTimePatterns = [
    // Month name formats (Apr 29, 2024 7:30 AM CDT)
    /\b([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}\s+\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
    /\b([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
    /\b(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s+\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
    /\b(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
    // Numeric formats
    /\b(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
    /\b(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
    /\b(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
    /\b(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
  ];

  // Time patterns with AM/PM and timezones (only with timezone info)
  // Order matters: longer patterns first to prevent substring matching
  const timePatterns = [
    /\b(\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,  // 4:00:00 PM EDT
    /\b(\d{1,2}:\d{2}:\d{2}\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,  // 16:00:00 EDT
    /\b(\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,         // 4:00 PM EDT
    /\b(\d{1,2}:\d{2}\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,         // 16:00 EDT
  ];
  
  // Helper function to check if a range overlaps with existing matches
  function isOverlapping(start, end) {
    return matchedRanges.some(range => 
      (start >= range.start && start < range.end) || 
      (end > range.start && end <= range.end) ||
      (start <= range.start && end >= range.end)
    );
  }
  
  // Helper function to add a match if it doesn't overlap
  function addMatch(match, utcDate, type) {
    const start = match.index;
    const end = match.index + match[0].length;
    
    if (!isOverlapping(start, end)) {
      matchedRanges.push({ start, end });
      timestamps.push({
        original: match[1],
        utc: utcDate,
        type: type
      });
    }
  }
  
  // Check for Unix timestamps
  unixPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const timestamp = match[1];
      const utcDate = convertUnixTimestampToUTC(timestamp);
      
      if (utcDate) {
        addMatch(match, utcDate, 'unix');
      }
    }
  });
  
  // Check for date formats
  datePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const dateStr = match[1];
      const utcDate = convertDateStringToUTC(dateStr);
      
      if (utcDate) {
        addMatch(match, utcDate, 'date');
      }
    }
  });

  // Check for date + time formats with AM/PM and timezones FIRST
  dateTimePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const dateTimeStr = match[1];
      const utcDate = convertDateStringToUTC(dateTimeStr);
      
      if (utcDate) {
        addMatch(match, utcDate, 'datetime');
      }
    }
  });

  // Check for time formats with AM/PM and timezones AFTER dateTime
  timePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const timeStr = match[1];
      const utcDate = convertTimeStringToUTC(timeStr);
      
      if (utcDate) {
        addMatch(match, utcDate, 'time');
      }
    }
  });
  
  return timestamps;
}

function convertUnixTimestampToUTC(timestamp) {
  try {
    let ts = parseInt(timestamp);
    
    // Convert to milliseconds if it's in seconds
    if (timestamp.length === 10) {
      ts = ts * 1000;
    }
    
    // Validate timestamp range (reasonable dates)
    if (ts < 0 || ts > Date.now() + 31536000000) { // Not more than 1 year in future
      return null;
    }
    
    const date = new Date(ts);
    return date.toISOString();
  } catch (error) {
    return null;
  }
}

function convertDateStringToUTC(dateStr) {
  try {
    // Handle timezone abbreviations
    const processedDateStr = handleTimezoneAbbreviationsInString(dateStr);
    const date = new Date(processedDateStr);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return null;
    }
    
    return date.toISOString();
  } catch (error) {
    return null;
  }
}

function convertTimeStringToUTC(timeStr) {
  try {
    // For time-only formats, use today's date as reference
    const today = new Date();
    const todayDateStr = today.toISOString().split('T')[0]; // Get YYYY-MM-DD
    const fullDateTimeStr = `${todayDateStr} ${timeStr}`;
    
    // Handle timezone abbreviations
    const processedDateStr = handleTimezoneAbbreviationsInString(fullDateTimeStr);
    const parsedDate = new Date(processedDateStr);
    
    if (isNaN(parsedDate.getTime())) {
      return null;
    }
    
    // Get UTC date components
    const utcDateStr = parsedDate.toISOString().split('T')[0];
    const utcTimeStr = parsedDate.toISOString().split('T')[1];
    
    // Compare local date (today) with UTC date
    const label = utcDateStr === todayDateStr ? 'Same day' : 'Next day';
    
    // Return relative format: "Same day 21:00:00.000Z", "Next day 05:30:00.000Z", etc.
    return `${label} ${utcTimeStr}`;
  } catch (error) {
    return null;
  }
}

function handleTimezoneAbbreviationsInString(dateTimeStr) {
  // Map of timezone abbreviations to UTC offsets
  const timezoneMap = {
    'EST': '-0500',  // Eastern Standard Time
    'EDT': '-0400',  // Eastern Daylight Time
    'CST': '-0600',  // Central Standard Time
    'CDT': '-0500',  // Central Daylight Time
    'MST': '-0700',  // Mountain Standard Time
    'MDT': '-0600',  // Mountain Daylight Time
    'PST': '-0800',  // Pacific Standard Time
    'PDT': '-0700',  // Pacific Daylight Time
    'UTC': '+0000',  // Coordinated Universal Time
    'GMT': '+0000'   // Greenwich Mean Time
  };
  
  let processedStr = dateTimeStr;
  
  // Find and replace timezone abbreviations
  for (const [abbr, offset] of Object.entries(timezoneMap)) {
    const regex = new RegExp(`\\s*${abbr}\\s*$`, 'i');
    if (regex.test(processedStr)) {
      processedStr = processedStr.replace(regex, ` ${offset}`);
      break;
    }
  }
  
  return processedStr;
}

function showFloatingError(message) {
  const floatingInput = floatingWindow.querySelector('#floating-manual-timestamp');
  floatingInput.style.borderColor = '#dc3545';
  floatingInput.style.backgroundColor = '#fff5f5';
  setTimeout(() => {
    floatingInput.style.borderColor = '#ced4da';
    floatingInput.style.backgroundColor = 'white';
  }, 2000);
  
  showFloatingMessage(message, '#dc3545');
}

function showFloatingSuccess(message) {
  const floatingInput = floatingWindow.querySelector('#floating-manual-timestamp');
  floatingInput.style.borderColor = '#28a745';
  floatingInput.style.backgroundColor = '#f0fff4';
  setTimeout(() => {
    floatingInput.style.borderColor = '#ced4da';
    floatingInput.style.backgroundColor = 'white';
  }, 2000);
  
  showFloatingMessage(message, '#28a745');
}

function showFloatingMessage(message, color) {
  // Create a temporary message positioned relative to the viewport, not the floating window
  const messageDiv = document.createElement('div');
  const windowRect = floatingWindow.getBoundingClientRect();
  
  messageDiv.style.cssText = `
    position: fixed;
    top: ${windowRect.top + 50}px;
    left: ${windowRect.left + windowRect.width / 2}px;
    transform: translateX(-50%);
    background: ${color};
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 10002;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    white-space: nowrap;
    pointer-events: none;
  `;
  messageDiv.textContent = message;
  
  // Append to document body instead of floating window to avoid positioning issues
  document.body.appendChild(messageDiv);
  
  setTimeout(() => {
    if (messageDiv.parentNode) {
      messageDiv.parentNode.removeChild(messageDiv);
    }
  }, 2500);
}

function clearAllTimestamps() {
  // Send message to background script to clear all timestamps
  chrome.runtime.sendMessage({
    action: 'clearTimestamps'
  });
  
  // Show success message
  showFloatingSuccess('All timestamps cleared');
  
  // Update floating window display
  setTimeout(() => {
    updateFloatingWindow();
  }, 500);
}

// Listen for messages from background script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateFloatingWindow') {
    updateFloatingWindow();
  } else if (message.action === 'toggleFloatingWindow') {
    toggleFloatingWindow();
  } else if (message.action === 'setFloatingWindowVisibility') {
    setFloatingWindowVisibility(message.visible);
  }
});

async function setFloatingWindowVisibility(visible) {
  if (visible) {
    await showFloatingWindow();
  } else {
    hideFloatingWindow();
  }
}

// Update floating window periodically
setInterval(updateFloatingWindow, 5000);

// Listen for storage changes to sync floating window visibility across tabs
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.floatingWindowVisible) {
    const newVisibility = changes.floatingWindowVisible.newValue;
    if (newVisibility !== isFloatingWindowVisible) {
      setFloatingWindowVisibility(newVisibility);
    }
  }
});

// Expose toggle function to global scope for testing
window.toggleTimestampFloatingWindow = function() {
  if (typeof toggleFloatingWindow === 'function') {
    toggleFloatingWindow();
  }
}; 