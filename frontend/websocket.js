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
        
        document.getElementById('systemHeatmap').textContent = cpu + '%';
        document.getElementById('metricCPU').textContent = cpu + '%';
        document.getElementById('metricMemory').textContent = mem + '%';
        document.getElementById('cpuBar').style.width = cpu + '%';
        document.getElementById('memBar').style.width = mem + '%';
        document.getElementById('cpuValue').textContent = cpu + '%';
        document.getElementById('memValue').textContent = mem + '%';
        
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
        
        document.getElementById('queueHeatmap').textContent = waiting;
        document.getElementById('metricQueueWait').textContent = waiting;
        document.getElementById('metricFailedJobs').textContent = failed;
        
        // Add to queue table
        const tbody = document.getElementById('queuesTableBody');
        if (tbody.rows.length > 0) {
            const row = tbody.rows[0];
            if (row.cells[0].textContent === 'No data') {
                tbody.innerHTML = '';
            }
        }
        
        const newRow = tbody.insertRow(0);
        newRow.innerHTML = `
            <td>${data.queueName || 'Queue'}</td>
            <td>${waiting}</td>
            <td>${active}</td>
            <td>${data.raw.completed || 0}</td>
            <td>${failed}</td>
            <td><span class="status-${data.status}">${data.status}</span></td>
        `;
        
        // Keep only latest 5
        while (tbody.rows.length > 5) {
            tbody.deleteRow(tbody.rows.length - 1);
        }
    } else if (type === 'redis') {
        const latency = Math.round(data.raw.latencyMs || 0);
        const memPercent = Math.round((data.raw.memUsedMB / data.raw.memMaxMB) * 100);
        const hitRate = Math.round(data.calculated?.hitRate || 0);
        
        document.getElementById('redisHeatmap').textContent = latency + 'ms';
        document.getElementById('metricRedisLatency').textContent = latency + 'ms';
        document.getElementById('redisLatency').textContent = latency + ' ms';
        document.getElementById('redisMemory').textContent = memPercent + '%';
        document.getElementById('redisClients').textContent = data.raw.connectedClients;
        document.getElementById('redisCommands').textContent = data.raw.commandPerSec;
        
        // Add to redis table
        const tbody = document.getElementById('redisTableBody');
        if (tbody.rows.length > 0) {
            const row = tbody.rows[0];
            if (row.cells[0].textContent === 'No data') {
                tbody.innerHTML = '';
            }
        }
        
        const newRow = tbody.insertRow(0);
        newRow.innerHTML = `
            <td>${latency}</td>
            <td>${memPercent}%</td>
            <td>${hitRate}%</td>
            <td>${data.raw.evictedKeys}</td>
            <td><span class="status-${data.status}">${data.status}</span></td>
        `;
        
        while (tbody.rows.length > 5) {
            tbody.deleteRow(tbody.rows.length - 1);
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

// Navigation
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-item').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;
            
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            
            document.getElementById(section).classList.add('active');
            link.classList.add('active');
        });
    });
    
    initWebSocket();
});
