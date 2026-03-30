let socket = null;

let currentData = {
    system: null,
    jobs: [],
    queue: {},
    redis: null,
    systemAnalysis: null,
    queueAnalysis: null,
    redisAnalysis: null
};

// Pagination state
let paginationState = {
    system: { cursor: null, hasMore: false },
    queue: { cursor: null, hasMore: false },
    redis: { cursor: null, hasMore: false },
    jobs: { cursor: null, hasMore: false }
};

function initWebSocket() {
    try {
        socket = io('http://localhost:5500', {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5
        });
        
        socket.on('connect', () => {
            console.log('Socket.io connected');
            updateConnectionStatus(true);
        });

        socket.on('systemSnapshot', (data) => {
            console.log('System snapshot received');
            currentData.system = data;
            updateUI('system', data);
            updateHeatmaps();
        });

        socket.on('groqSystemAnalyse', (data) => {
            console.log('System analysis received');
            currentData.systemAnalysis = data;
            displayAnalysis('system', data);
            updateHeatmaps();
        });

        socket.on('queueSnapshot', (data) => {
            console.log('Queue snapshot received');
            currentData.queue = data;
            updateUI('queue', data);
            updateHeatmaps();
        });

        socket.on('groqQueueAnalyse', (data) => {
            console.log('Queue analysis received');
            currentData.queueAnalysis = data;
            displayAnalysis('queue', data);
            updateHeatmaps();
        });

        socket.on('redisSnapshot', (data) => {
            console.log('Redis snapshot received');
            currentData.redis = data;
            updateUI('redis', data);
            updateHeatmaps();
        });

        socket.on('groqRedisAnalyse', (data) => {
            console.log('Redis analysis received');
            currentData.redisAnalysis = data;
            displayAnalysis('redis', data);
            updateHeatmaps();
        });

        socket.on('jobSnapshot', (data) => {
            console.log('Job snapshot received');
            if (!currentData.jobs) currentData.jobs = [];
            currentData.jobs.unshift(data); // Add to beginning
            if (currentData.jobs.length > 5) currentData.jobs.pop(); // Keep last 5
            updateUI('jobs', data);
        });

        socket.on('groqJobAnalyse', (data) => {
            console.log('Job analysis received');
            currentData.jobAnalysis = data;
            updateUI('jobs', data);
        });

        socket.on('disconnect', () => {
            console.log('Socket disconnected');
            updateConnectionStatus(false);
        });

        socket.on('error', (err) => {
            console.error('Socket error:', err);
            updateConnectionStatus(false);
        });
    } catch (err) {
        console.error('Socket.io init error:', err);
        updateConnectionStatus(false);
    }
}

function updateUI(type, data) {
    if (type === 'system') {
        const cpu = Math.round(data.raw.cpuPercent || 0);
        const mem = Math.round(data.calculated.memUsedPercent || 0);
        const isHighCPU = data.calculated.isHighCPU;
        const isHighMem = data.calculated.isHighMemory;
        
        // Update live metrics only (not history table)
        document.getElementById('systemHeatmap').textContent = cpu + '%';
        document.getElementById('metricCPU').textContent = cpu + '%';
        document.getElementById('metricMemory').textContent = mem + '%';
        document.getElementById('cpuBar').style.width = cpu + '%';
        document.getElementById('memBar').style.width = mem + '%';
        document.getElementById('cpuValue').textContent = cpu + '%';
        document.getElementById('memValue').textContent = mem + '%';
        
        // Add live status box
        const liveStatus = document.getElementById('systemLiveStatus');
        if (liveStatus) {
            const alertClass = isHighCPU || isHighMem ? 'alert-danger' : 'alert-success';
            const alertText = isHighCPU ? 'HIGH CPU' : isHighMem ? 'HIGH MEMORY' : 'Healthy';
            liveStatus.innerHTML = `<span class="${alertClass}">${alertText}</span>`;
        }
        
        // System details
        const details = `CPU: ${cpu}% (${data.raw.coreCount} cores)
Memory: ${data.raw.memFreeMB}MB free / ${data.raw.memTotalMB}MB total
Load: ${data.raw.loadAvg1M.toFixed(2)} 1m, ${data.raw.loadAvg5M.toFixed(2)} 5m, ${data.raw.loadAvg15M.toFixed(2)} 15m
Uptime: ${Math.floor(data.raw.uptime / 3600)} hours
Platform: ${data.raw.platform}`;
        document.getElementById('systemDetails').innerHTML = `<pre>${details}</pre>`;
    } else if (type === 'queue') {
        const waiting = Math.round(data.raw.waiting || 0);
        const active = Math.round(data.raw.active || 0);
        const failed = Math.round(data.raw.failed || 0);
        
        // Update live metrics only
        document.getElementById('queueHeatmap').textContent = waiting;
        document.getElementById('metricQueueWait').textContent = waiting;
        document.getElementById('metricFailedJobs').textContent = failed;
        document.getElementById('metricActiveJobs').textContent = active;
        
        // Add live queue status
        const liveStatus = document.getElementById('queueLiveStatus');
        if (liveStatus) {
            const alertClass = failed > 0 ? 'alert-danger' : waiting > 100 ? 'alert-warning' : 'alert-success';
            const alertText = failed > 0 ? 'FAILED JOBS' : waiting > 100 ? 'HIGH QUEUE' : 'Healthy';
            liveStatus.innerHTML = `<span class="${alertClass}">${alertText}</span>`;
        }
        
        // Live queue info
        const queueInfo = document.getElementById('queueLiveInfo');
        if (queueInfo) {
            queueInfo.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 13px;">
                    <div><span style="color: var(--text-secondary);">Waiting:</span> <span style="font-weight: bold;">${waiting}</span></div>
                    <div><span style="color: var(--text-secondary);">Active:</span> <span style="font-weight: bold;">${active}</span></div>
                    <div><span style="color: var(--text-secondary);">Failed:</span> <span style="font-weight: bold;">${failed}</span></div>
                </div>
            `;
        }
    } else if (type === 'redis') {
        const latency = Math.round(data.raw.latencyMs || 0);
        const memPercent = Math.round((data.raw.memUsedMB / data.raw.memMaxMB) * 100);
        const hitRate = Math.round(data.calculated?.hitRate || 0);
        
        // Update live metrics only
        document.getElementById('redisHeatmap').textContent = latency + 'ms';
        document.getElementById('metricRedisLatency').textContent = latency + 'ms';
        document.getElementById('redisLatency').textContent = latency + ' ms';
        document.getElementById('redisMemory').textContent = memPercent + '%';
        document.getElementById('redisClients').textContent = data.raw.connectedClients;
        document.getElementById('redisCommands').textContent = data.raw.commandPerSec;
        
        // Add live redis status
        const liveStatus = document.getElementById('redisLiveStatus');
        if (liveStatus) {
            const alertClass = latency > 100 ? 'alert-danger' : latency > 50 ? 'alert-warning' : 'alert-success';
            const alertText = latency > 100 ? 'HIGH LATENCY' : latency > 50 ? 'SLOW' : 'Healthy';
            liveStatus.innerHTML = `<span class="${alertClass}">${alertText}</span>`;
        }
    } else if (type === 'jobs') {
        const isAnomaly = data.isAnomaly || false;
        const status = data.status || 'unknown';
        
        // Update live jobs status
        const liveStatus = document.getElementById('jobsLiveStatus');
        if (liveStatus) {
            const alertClass = isAnomaly ? 'alert-danger' : status === 'failed' ? 'alert-warning' : 'alert-success';
            const alertText = isAnomaly ? 'ANOMALY' : status === 'failed' ? 'FAILED JOB' : 'Running';
            liveStatus.innerHTML = `<span class="${alertClass}">${alertText}</span>`;
        }
    }
}

function updateHeatmaps() {
    // System heatmap
    if (currentData.system) {
        const cpu = Math.round(currentData.system.raw.cpuPercent);
        const mem = Math.round(currentData.system.calculated.memUsedPercent);
        const isHighCPU = currentData.system.calculated.isHighCPU;
        const isHighMem = currentData.system.calculated.isHighMemory;
        
        let severity = 'success';
        let alert = '';
        
        if (isHighCPU || isHighMem) {
            severity = 'critical';
            alert = isHighCPU ? 'High CPU!' : isHighMem ? 'High Memory!' : '';
        }
        
        document.getElementById('systemHeatmap').textContent = cpu + '%';
        document.getElementById('systemCard').className = 'heatmap-card ' + severity;
        document.getElementById('systemAlert').textContent = alert;
    }
    
    // Queue heatmap
    if (currentData.queue && currentData.queueAnalysis) {
        const isAnomaly = currentData.queueAnalysis.isAnomaly;
        const severity = currentData.queueAnalysis.severity;
        
        let cardClass = 'success';
        if (severity === 'critical' || severity === 'high' || isAnomaly) cardClass = 'danger';
        else if (severity === 'medium' || severity === 'warning') cardClass = 'warning';
        
        const waiting = Math.round(currentData.queue.raw.waiting || 0);
        document.getElementById('queueHeatmap').textContent = waiting;
        document.getElementById('queueCard').className = 'heatmap-card ' + cardClass;
        document.getElementById('queueAlert').textContent = isAnomaly ? 'Anomaly!' : '';
    }
    
    // Redis heatmap
    if (currentData.redis && currentData.redisAnalysis) {
        const isAnomaly = currentData.redisAnalysis.isAnomaly;
        const severity = currentData.redisAnalysis.severity;
        const latency = Math.round(currentData.redis.raw.latencyMs);
        
        let cardClass = 'success';
        if (severity === 'critical' || latency > 100) cardClass = 'danger';
        else if (severity === 'high' || latency > 50) cardClass = 'warning';
        
        document.getElementById('redisHeatmap').textContent = latency + 'ms';
        document.getElementById('redisCard').className = 'heatmap-card ' + cardClass;
        document.getElementById('redisAlert').textContent = isAnomaly ? 'Issues!' : '';
    }
}

function displayAnalysis(type, data) {
    const containerId = type + 'Analysis';
    const container = document.getElementById(containerId);
    
    const html = `
        <div style="font-size: 13px; line-height: 1.6;">
            <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                <strong>${data.summary}</strong>
            </div>
            <div style="margin-bottom: 8px;"><strong>Severity:</strong> ${data.severity}</div>
            <div style="margin-bottom: 8px;"><strong>Reason:</strong> ${data.reason}</div>
            <div><strong>Action:</strong> ${data.action}</div>
            ${data.isAnomaly ? '<div style="color: var(--danger); margin-top: 8px;">⚠ ANOMALY DETECTED</div>' : ''}
        </div>
    `;
    
    container.innerHTML = html;
}

function updateConnectionStatus(connected) {
    const indicator = document.getElementById('wsIndicator');
    const status = document.getElementById('wsStatus');
    
    if (connected) {
        indicator.classList.add('connected');
        status.textContent = 'Connected';
    } else {
        indicator.classList.remove('connected');
        status.textContent = 'Disconnected';
    }
}

// Pagination functions
async function fetchNextPage(type) {
    const cursor = paginationState[type].cursor;
    
    try {
        let endpoint = '';
        let tableBodyId = '';
        let pageInfoId = '';
        let parseFunction = null;
        let buttonId = '';
        
        if (type === 'system') {
            endpoint = 'http://localhost:3000/api/system/result';
            tableBodyId = 'systemHistoryBody';
            pageInfoId = 'systemPageInfo';
            buttonId = 'systemNextBtn';
            parseFunction = parseSystemRow;
        } else if (type === 'queue') {
            endpoint = 'http://localhost:3000/api/queue/result';
            tableBodyId = 'queueHistoryBody';
            pageInfoId = 'queuePageInfo';
            buttonId = 'queuesNextBtn';
            parseFunction = parseQueueRow;
        } else if (type === 'redis') {
            endpoint = 'http://localhost:3000/api/redis/result';
            tableBodyId = 'redisHistoryBody';
            pageInfoId = 'redisPageInfo';
            buttonId = 'redisNextBtn';
            parseFunction = parseRedisRow;
        } else if (type === 'jobs') {
            endpoint = 'http://localhost:3000/api/job/result';
            tableBodyId = 'jobsHistoryBody';
            pageInfoId = 'jobsPageInfo';
            buttonId = 'jobsNextBtn';
            parseFunction = parseJobRow;
        }
        
        // Get elements
        const tbody = document.getElementById(tableBodyId);
        const nextBtn = document.getElementById(buttonId);
        const pageInfo = document.getElementById(pageInfoId);
        
        if (!tbody) {
            console.error(`Table body not found: ${tableBodyId}`);
            return;
        }
        
        // Build query
        const params = new URLSearchParams();
        if (cursor) params.append('cursorId', cursor);
        
        const url = `${endpoint}?${params.toString()}`;
        console.log(`🔄 Fetching ${type} pagination:`, url);
        
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`API error for ${type}:`, response.status);
            if (pageInfo) pageInfo.textContent = 'Error loading data';
            if (nextBtn) nextBtn.disabled = true;
            return;
        }
        
        const apiData = await response.json();
        console.log(`✅ Response for ${type}:`, apiData);
        
        if (!apiData.status) {
            console.warn(`API returned status=false for ${type}`);
            if (pageInfo) pageInfo.textContent = 'No data available';
            if (nextBtn) nextBtn.disabled = true;
            return;
        }
        
        if (!apiData.data || apiData.data.length === 0) {
            console.warn(`No data returned for ${type}`);
            if (pageInfo) pageInfo.textContent = 'No more records';
            if (nextBtn) nextBtn.disabled = true;
            return;
        }
        
        // Clear "No data" row if exists
        if (tbody.rows.length === 1) {
            const firstRow = tbody.rows[0];
            if (firstRow.textContent.includes('No data') || firstRow.getAttribute('class')?.includes('empty')) {
                tbody.innerHTML = '';
            }
        }
        
        // Add new rows
        console.log(`Adding ${apiData.data.length} rows to ${tableBodyId}`);
        apiData.data.forEach(record => {
            const newRow = tbody.insertRow();
            try {
                parseFunction(newRow, record);
            } catch (e) {
                console.error(`Error parsing row for ${type}:`, e);
            }
        });
        
        // Keep max 20 rows visible
        while (tbody.rows.length > 20) {
            tbody.deleteRow(0);
        }
        
        // Update pagination state for NEXT call
        paginationState[type].cursor = apiData.nextCursor || null;
        paginationState[type].hasMore = apiData.hasMore === true;
        
        console.log(`📊 Updated pagination state for ${type}:`, paginationState[type]);
        
        // Update UI
        if (nextBtn) {
            if (apiData.hasMore === true) {
                nextBtn.disabled = false;
            } else {
                nextBtn.disabled = true;
            }
        }
        
        if (pageInfo) {
            if (apiData.hasMore === true) {
                pageInfo.textContent = `Loaded: ${tbody.rows.length} records | Click Next for more`;
            } else {
                pageInfo.textContent = `Loaded: ${tbody.rows.length} records | No more data`;
            }
        }
        
    } catch (error) {
        console.error('🚨 Error fetching next page for', type, ':', error);
        const pageInfo = document.getElementById(pageInfoId || (type + 'PageInfo'));
        if (pageInfo) pageInfo.textContent = 'Error: ' + error.message;
    }
}

function parseSystemRow(row, record) {
    const cpu = Math.round(record.raw?.cpuPercent || 0);
    const mem = Math.round(record.calculated?.memUsedPercent || 0);
    
    row.innerHTML = `
        <td>${new Date(record.capturedAt).toLocaleString()}</td>
        <td>${cpu}%</td>
        <td>${mem}%</td>
        <td><span class="status-${record.status}">${record.status}</span></td>
    `;
}

function parseQueueRow(row, record) {
    const waiting = Math.round(record.raw?.waiting || 0);
    const active = Math.round(record.raw?.active || 0);
    const completed = Math.round(record.raw?.completed || 0);
    const failed = Math.round(record.raw?.failed || 0);
    
    row.innerHTML = `
        <td>${record.queueName || 'Queue'}</td>
        <td>${waiting}</td>
        <td>${active}</td>
        <td>${completed}</td>
        <td>${failed}</td>
        <td><span class="status-${record.status}">${record.status}</span></td>
    `;
}

function parseRedisRow(row, record) {
    const latency = Math.round(record.raw?.latencyMs || 0);
    const memPercent = Math.round((record.raw?.memUsedMB / record.raw?.memMaxMB) * 100) || 0;
    const hitRate = Math.round(record.calculated?.hitRate || 0);
    
    row.innerHTML = `
        <td>${latency}</td>
        <td>${memPercent}%</td>
        <td>${hitRate}%</td>
        <td>${record.raw?.evictedKeys || 0}</td>
        <td><span class="status-${record.status}">${record.status}</span></td>
    `;
}

function parseJobRow(row, record) {
    const jobId = record.jobId?.substring(0, 8) || '--';
    const status = record.status || 'unknown';
    const attempts = record.attemptsMade || 0;
    const anomaly = record.isAnomaly ? 'Yes' : 'No';
    
    row.innerHTML = `
        <td>${jobId}</td>
        <td>${record.queueName || '--'}</td>
        <td><span class="status-${status}">${status}</span></td>
        <td>${Math.round(record.processingTimeMs || 0)}</td>
        <td>${attempts}</td>
        <td>${anomaly}</td>
    `;
}

// Navigation
document.addEventListener('DOMContentLoaded', () => {
    // Show diagnostic info
    console.log('=== Trace Mind Dashboard Loaded ===');
    console.log('Pagination State:', paginationState);
    console.log('Current Data:', currentData);
    
    document.querySelectorAll('.nav-item').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;
            
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            
            document.getElementById(section).classList.add('active');
            link.classList.add('active');
            
            console.log(`📌 Switched to section: ${section}`);
        });
    });
    
    // Initialize WebSocket
    initWebSocket();
    
    // Periodic diagnostic
    setInterval(() => {
        console.log(`📊 Current State - System: ${currentData.system ? '✓' : '✗'}, Queue: ${currentData.queue?.queueName ? '✓' : '✗'}, Redis: ${currentData.redis ? '✓' : '✗'}`);
    }, 15000);
});
