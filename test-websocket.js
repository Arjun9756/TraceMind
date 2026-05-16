// Test WebSocket Connection
const io = require('socket.io-client');

console.log('Testing WebSocket Connection...\n');

const socket = io('http://localhost:5500', {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 3
});

socket.on('connect', () => {
    console.log('WebSocket Connected!');
    console.log('Socket ID:', socket.id);
    console.log('\nListening for events...\n');
});

socket.on('queueSnapshot', (data) => {
    console.log('Queue Snapshot Received:');
    console.log('  Queue:', data.queueName);
    console.log('  Waiting:', data.raw.waiting);
    console.log('  Status:', data.status);
    console.log('');
});

socket.on('groqQueueAnalyse', (data) => {
    console.log('Queue AI Analysis:');
    console.log('  Summary:', data.summary);
    console.log('  Severity:', data.severity);
    console.log('');
});

socket.on('systemSnapshot', (data) => {
    console.log('System Snapshot Received:');
    console.log('  CPU:', data.raw.cpuPercent.toFixed(1) + '%');
    console.log('  Memory:', data.calculated.memUsedPercent.toFixed(1) + '%');
    console.log('  Status:', data.status);
    console.log('');
});

socket.on('redisSnapshot', (data) => {
    console.log('Redis Snapshot Received:');
    console.log('  Latency:', data.raw.latencyMs + 'ms');
    console.log('  Hit Rate:', data.calculated.hitRate.toFixed(1) + '%');
    console.log('  Status:', data.status);
    console.log('');
});

socket.on('jobSnapshot', (data) => {
    console.log('Job Event Received:');
    console.log('  Job ID:', data.jobId);
    console.log('  Status:', data.status);
    console.log('  Processing:', data.processingMs + 'ms');
    console.log('');
});

socket.on('disconnect', () => {
    console.log('WebSocket Disconnected');
});

socket.on('error', (err) => {
    console.error('WebSocket Error:', err.message);
});

socket.on('connect_error', (err) => {
    console.error('Connection Error:', err.message);
});

console.log('Waiting for events... (Press Ctrl+C to stop)\n');

process.on('SIGINT', () => {
    console.log('\nStopping test...');
    socket.disconnect();
    process.exit(0);
});
