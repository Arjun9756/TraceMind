// App initialization - minimal helper functions

document.addEventListener('DOMContentLoaded', () => {
    // Initialize table with empty state
    const tables = ['jobsTableBody', 'queuesTableBody', 'redisTableBody'];
    tables.forEach(id => {
        const tbody = document.getElementById(id);
        if (tbody && tbody.rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty">Waiting for data...</td></tr>';
        }
    });
    
    // Add CSS for status indicators
    const style = document.createElement('style');
    style.textContent = `
        .status-healthy, .status-low { color: var(--success); }
        .status-warning, .status-medium { color: var(--warning); }
        .status-critical, .status-high { color: var(--danger); }
    `;
    document.head.appendChild(style);
});
