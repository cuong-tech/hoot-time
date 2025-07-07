// Content script to detect timestamp selections
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
    }
  }
});

function extractTimestamps(text) {
  const timestamps = [];
  
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

  // Time patterns with AM/PM and timezones (only with timezone info)
  const timePatterns = [
    /\b(\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,  // 4:00:00 PM EDT
    /\b(\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,         // 4:00 PM EDT
    /\b(\d{1,2}:\d{2}:\d{2}\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,  // 16:00:00 EDT
    /\b(\d{1,2}:\d{2}\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,         // 16:00 EDT
  ];

  // Date + time patterns with AM/PM and timezones (only with timezone info)
  const dateTimePatterns = [
    /\b(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
    /\b(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
    /\b(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
    /\b(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))\b/gi,
  ];
  
  // Check for Unix timestamps
  unixPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const timestamp = match[1];
      const utcDate = convertUnixToUTC(timestamp);
      
      if (utcDate) {
        timestamps.push({
          original: timestamp,
          utc: utcDate,
          type: 'unix'
        });
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
        timestamps.push({
          original: dateStr,
          utc: utcDate,
          type: 'date'
        });
      }
    }
  });

  // Check for time formats with AM/PM and timezones
  timePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const timeStr = match[1];
      const utcDate = convertTimeToUTC(timeStr);
      
      if (utcDate) {
        timestamps.push({
          original: timeStr,
          utc: utcDate,
          type: 'time'
        });
      }
    }
  });

  // Check for date + time formats with AM/PM and timezones
  dateTimePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const dateTimeStr = match[1];
      const utcDate = convertDateToUTC(dateTimeStr);
      
      if (utcDate) {
        timestamps.push({
          original: dateTimeStr,
          utc: utcDate,
          type: 'datetime'
        });
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
    // For time-only formats, we need to add today's date
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // Get YYYY-MM-DD
    const fullDateTimeStr = `${todayStr} ${timeStr}`;
    
    // Handle timezone abbreviations
    const processedDateStr = handleTimezoneAbbreviations(fullDateTimeStr);
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