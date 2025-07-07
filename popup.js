// Popup script for timestamp management
document.addEventListener('DOMContentLoaded', function() {
    const timestampList = document.getElementById('timestampList');
    const clearAllBtn = document.getElementById('clearAll');
    const refreshBtn = document.getElementById('refresh');
    const timestampCount = document.getElementById('timestampCount');
    
    // Load timestamps on popup open
    loadTimestamps();
    
    // Event listeners
    clearAllBtn.addEventListener('click', clearAllTimestamps);
    refreshBtn.addEventListener('click', loadTimestamps);
    
    async function loadTimestamps() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getTimestamps' });
            const timestamps = response.timestamps || [];
            
            displayTimestamps(timestamps);
            updateCount(timestamps.length);
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
                </div>
            `;
            return;
        }
        
        // Sort timestamps by most recent first
        const sortedTimestamps = timestamps.sort((a, b) => 
            new Date(b.addedAt) - new Date(a.addedAt)
        );
        
        timestampList.innerHTML = sortedTimestamps.map(timestamp => 
            createTimestampHTML(timestamp)
        ).join('');
        
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
                    <div class="timestamp-time">${timeAgo}</div>
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
}); 