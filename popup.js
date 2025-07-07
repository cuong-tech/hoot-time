// Popup script for timestamp management
document.addEventListener('DOMContentLoaded', function() {
    const timestampList = document.getElementById('timestampList');
    const clearAllBtn = document.getElementById('clearAll');
    const refreshBtn = document.getElementById('refresh');
    const toggleFloatingBtn = document.getElementById('toggleFloating');
    const timestampCount = document.getElementById('timestampCount');
    const manualTimestampInput = document.getElementById('manualTimestamp');
    const convertBtn = document.getElementById('convertBtn');
    
    // Load timestamps on popup open
    loadTimestamps();
    
    // Event listeners
    clearAllBtn.addEventListener('click', clearAllTimestamps);
    refreshBtn.addEventListener('click', loadTimestamps);
    toggleFloatingBtn.addEventListener('click', toggleFloatingWindow);
    convertBtn.addEventListener('click', convertManualTimestamp);
    
    // Allow Enter key to trigger conversion
    manualTimestampInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            convertManualTimestamp();
        }
    });
    
    async function loadTimestamps() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getTimestamps' });
            const timestamps = response.timestamps || [];
            
            displayTimestamps(timestamps);
        } catch (error) {
            console.error('Error loading timestamps:', error);
            showError('Failed to load timestamps');
        }
    }
    
    function displayTimestamps(timestamps) {
        if (timestamps.length === 0) {
            timestampList.innerHTML = `
                <div class="empty-state">
                    <p>No timestamps found yet.</p>
                    <p>Highlight text containing timestamps on any webpage to get started!</p>
                    <p style="font-size: 12px; color: #999; margin-top: 8px;">💡 Tip: Click time labels to edit them, × to remove</p>
                </div>
            `;
            return;
        }
        
        // Sort timestamps by most recent first
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
        
        timestampList.innerHTML = deduped.map(timestamp => 
            createTimestampHTML(timestamp)
        ).join('');
        
        // Update count to reflect deduplicated count
        updateCount(deduped.length);
        
        // Add event listeners for remove and copy buttons
        addTimestampEventListeners();
    }
    
    function createTimestampHTML(timestamp) {
        const addedDate = new Date(timestamp.addedAt);
        const timeAgo = getTimeAgo(addedDate);
        
        return `
            <div class="timestamp-item" data-id="${timestamp.id}">
                <div class="timestamp-header">
                    <span class="timestamp-type ${timestamp.type}">${timestamp.type}</span>
                    <button class="remove-btn" data-id="${timestamp.id}">×</button>
                </div>
                
                <div class="timestamp-original">
                    <strong>Original:</strong> ${escapeHtml(timestamp.original)}
                </div>
                
                <div class="timestamp-utc">
                    <strong>UTC:</strong> ${timestamp.utc}
                    <button class="copy-btn" data-text="${timestamp.utc}">Copy</button>
                </div>
                
                <div class="timestamp-meta">
                    <div class="timestamp-source">
                        <a href="${timestamp.url}" target="_blank" title="${timestamp.title}">
                            ${truncateText(timestamp.title, 30)}
                        </a>
                    </div>
                    <div class="timestamp-time">
                        <span class="time-label-popup" data-id="${timestamp.id}" style="cursor: pointer; text-decoration: underline; text-decoration-style: dotted;" title="Click to edit label">
                            ${timestamp.customLabel || timeAgo}
                        </span>
                    </div>
                </div>
            </div>
        `;
    }
    
    function addTimestampEventListeners() {
        // Remove button listeners
        document.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                removeTimestamp(id);
            });
        });
        
        // Copy button listeners
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const text = this.dataset.text;
                copyToClipboard(text, this);
            });
        });
        
        // Time label edit listeners
        document.querySelectorAll('.time-label-popup').forEach(label => {
            label.addEventListener('click', function() {
                editTimeLabel(this);
            });
        });
    }
    
    async function removeTimestamp(id) {
        try {
            await chrome.runtime.sendMessage({ action: 'removeTimestamp', id: id });
            loadTimestamps(); // Refresh the list
        } catch (error) {
            console.error('Error removing timestamp:', error);
            showError('Failed to remove timestamp');
        }
    }
    
    async function clearAllTimestamps() {
        if (confirm('Are you sure you want to clear all timestamps?')) {
            try {
                await chrome.runtime.sendMessage({ action: 'clearTimestamps' });
                loadTimestamps(); // Refresh the list
            } catch (error) {
                console.error('Error clearing timestamps:', error);
                showError('Failed to clear timestamps');
            }
        }
    }
    
    function copyToClipboard(text, button) {
        navigator.clipboard.writeText(text).then(() => {
            // Visual feedback
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            button.classList.add('copied');
            
            setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('copied');
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy text:', err);
            showError('Failed to copy to clipboard');
        });
    }
    
    function editTimeLabel(element) {
        const id = element.getAttribute('data-id');
        const currentText = element.textContent;
        
        if (!id) return;
        
        // Create input field
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentText;
        input.style.cssText = `
            font-size: 12px;
            font-family: inherit;
            background: white;
            border: 1px solid #ccc;
            border-radius: 3px;
            padding: 2px 4px;
            width: 100px;
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
                
                // Refresh the popup
                loadTimestamps();
                
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
    
    function updateCount(count) {
        timestampCount.textContent = count;
    }
    
    function showError(message) {
        timestampList.innerHTML = `
            <div class="error-state">
                <p style="color: #dc3545;">${message}</p>
            </div>
        `;
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
    
    function getTimeAgo(date) {
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) {
            return 'Just now';
        } else if (diffInSeconds < 3600) {
            const minutes = Math.floor(diffInSeconds / 60);
            return `${minutes}m ago`;
        } else if (diffInSeconds < 86400) {
            const hours = Math.floor(diffInSeconds / 3600);
            return `${hours}h ago`;
        } else {
            const days = Math.floor(diffInSeconds / 86400);
            return `${days}d ago`;
        }
    }
    
    function toggleFloatingWindow() {
        // Send message to current tab's content script
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'toggleFloatingWindow'
            });
        });
    }
    
    async function convertManualTimestamp() {
        const input = manualTimestampInput.value.trim();
        if (!input) {
            showInputError('Please enter a timestamp');
            return;
        }
        
        try {
            const timestamps = extractTimestamps(input);
            
            if (timestamps.length === 0) {
                showInputError('No valid timestamp format detected');
                return;
            }
            
            // Send to background script to add to storage
            await chrome.runtime.sendMessage({
                action: 'addTimestamps',
                timestamps: timestamps,
                url: 'manual-entry',
                title: 'Manual Entry'
            });
            
            // Clear input and refresh list
            manualTimestampInput.value = '';
            loadTimestamps();
            
            // Show success feedback
            showInputSuccess(`Converted ${timestamps.length} timestamp${timestamps.length > 1 ? 's' : ''}`);
            
        } catch (error) {
            console.error('Error converting manual timestamp:', error);
            showInputError('Error converting timestamp');
        }
    }
    
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
    
    function showInputError(message) {
        manualTimestampInput.style.borderColor = '#dc3545';
        manualTimestampInput.style.backgroundColor = '#fff5f5';
        setTimeout(() => {
            manualTimestampInput.style.borderColor = '#ced4da';
            manualTimestampInput.style.backgroundColor = 'white';
        }, 2000);
        
        // Show temporary error message
        showTemporaryMessage(message, 'error');
    }
    
    function showInputSuccess(message) {
        manualTimestampInput.style.borderColor = '#28a745';
        manualTimestampInput.style.backgroundColor = '#f0fff4';
        setTimeout(() => {
            manualTimestampInput.style.borderColor = '#ced4da';
            manualTimestampInput.style.backgroundColor = 'white';
        }, 2000);
        
        // Show temporary success message
        showTemporaryMessage(message, 'success');
    }
    
    function showTemporaryMessage(message, type) {
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: ${type === 'error' ? '#dc3545' : '#28a745'};
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            font-size: 14px;
            z-index: 10001;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-family: inherit;
        `;
        messageDiv.textContent = message;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 3000);
    }
}); 