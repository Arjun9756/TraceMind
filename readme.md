# TraceMind — Distributed System Monitor

A real-time backend infrastructure monitoring system that detects silent failures, queue anomalies, and system degradation before they crash your production app.

---

## Table of Contents

1. [What is TraceMind?](#what-is-tracemind)
2. [How It Works](#how-it-works)
3. [Architecture](#architecture)
4. [Data Collection](#data-collection)
5. [Metric Calculations](#metric-calculations)
6. [Anomaly Detection](#anomaly-detection)
7. [AI Explanation Engine](#ai-explanation-engine)
8. [WebSocket — Live Updates](#websocket--live-updates)
9. [API Reference](#api-reference)
10. [Database Schema](#database-schema)

---

## What is TraceMind?

Most monitoring tools tell you **what** happened after it already broke. TraceMind tells you **before** it breaks.

It monitors four key areas of your backend system in real-time:

| Area | What We Watch |
|---|---|
| **Queue** | Job backlog, failure rate, ghost failures, retry storms |
| **Workers** | Processing time, stalled count, concurrency |
| **System** | CPU usage, memory pressure, load average |
| **Redis** | Latency, hit rate, memory eviction, connection count |

### The Core Problem We Solve

```
Your system shows:  "Everything is fine ✅"
Reality:            45 jobs stuck in queue, workers dead 💀
```

This is called a **Ghost Failure** — the most dangerous type of silent failure. TraceMind detects it in real-time.

---

## How It Works

```
Business Server                    TraceMind Server
───────────────                    ────────────────

Every 5 seconds:                   POST /api/queue-snapshot
  queue.getJobCounts()    ──────►  1. Fetch prev data from Redis
  queue.getStalledCount()          2. Calculate metrics
                                   3. Detect anomalies
                                   4. Save to MongoDB
On every job complete:             5. Generate AI explanation
  job.finishedOn                   6. Broadcast via WebSocket
  job.processedOn         ──────►  POST /api/job-event
                                      → Update processing history
Every 30 seconds:
  os.cpus()               ──────►  POST /api/system-snapshot
  os.freemem()
  redis.info()            ──────►  POST /api/redis-snapshot
```

### Simple Flow

```
Business sends raw data
        ↓
TraceMind calculates metrics (growthRate, failureRate, zScore etc.)
        ↓
Saves raw + calculated together in MongoDB (for future analysis)
        ↓
If anomaly detected → Groq AI generates explanation
        ↓
WebSocket broadcasts to all connected dashboards
        ↓
Dashboard updates live ✅
```

---

## Architecture

```
src/
  Models/
    QueueSnapshot.model.ts     ← Queue + Worker data
    SystemSnapshot.model.ts    ← CPU + Memory + OS data
    RedisSnapshot.model.ts     ← Redis health data
    JobEvent.model.ts          ← Individual job records

  Routes/
    queue.routes.ts            ← POST /api/queue-snapshot
    redis.routes.ts            ← POST /api/redis-snapshot
    system.routes.ts           ← POST /api/system-snapshot
    job.routes.ts              ← POST /api/job-event

  BusinessLogic/
    CalculateQueue.ts          ← growthRate, failureRate, zScore
    CalculateRedis.ts          ← hitRate, memUsedPercent
    CalculateSystem.ts         ← memUsedMB, memUsedPercent

  Utility/
    Redis.config.ts            ← Redis client (stores prev state)
    Socket.ts                  ← WebSocket server
    Broadcaster.ts             ← Emit snapshots to dashboard
    generateExplanation.ts     ← Groq AI integration
    Groq.config.ts             ← Groq client setup
    DB.ts                      ← MongoDB connection
```

---

## Data Collection

### What Business Server Sends

The business server sends **raw data only** — no calculations. TraceMind does all the math.

#### Queue Snapshot
```json
POST /api/queue-snapshot

{
  "queueName":    "emailQueue",
  "waiting":      45,
  "active":        3,
  "completed":  1200,
  "failed":       23,
  "delayed":       5,
  "stalledCount":  0,
  "concurrency":   4
}
```

#### Job Event (sent on every job complete/fail)
```json
POST /api/job-event

{
  "queueName":    "emailQueue",
  "jobId":        "job_abc123",
  "jobName":      "sendEmail",
  "processingMs": 205,
  "attemptsMade": 1,
  "maxAttempts":  3,
  "status":       "completed",
  "errorMsg":     null
}
```

> **Why job events separately?**
> `processingMs` is not available from `queue.getJobCounts()`.
> It comes from individual job timestamps: `job.finishedOn - job.processedOn`.
> This value is needed to calculate `avgProcessingMs` and `zScore`.

#### System Snapshot
```json
POST /api/system-snapshot

{
  "cpuPercent":    45.5,
  "memTotalMB":  16384,
  "memFreeMB":    6000,
  "loadAvg1m":     1.2,
  "loadAvg5m":     0.9,
  "loadAvg15m":    0.7,
  "coreCount":       8,
  "processHeapMB": 128,
  "processRssMB":  256,
  "platform":    "linux",
  "nodeVersion":  "v20.0",
  "uptime":       86400,
  "processUptime": 3600
}
```

#### Redis Snapshot
```json
POST /api/redis-snapshot

{
  "latencyMs":        3,
  "memUsedMB":      256,
  "memMaxMB":       512,
  "connectedClients": 5,
  "commandsPerSec": 1200,
  "evictedKeys":       0,
  "keyspaceHits":    900,
  "keyspaceMisses":  100
}
```

### How Business Server Collects This Data

```typescript
// On the business server — runs every 5 seconds
setInterval(async () => {
  const counts = await emailQueue.getJobCounts()

  fetch('http://tracemind-server/api/queue-snapshot', {
    method: 'POST',
    body: JSON.stringify({
      queueName:    'emailQueue',
      waiting:      counts.waiting,      // jobs pending
      active:       counts.active,       // being processed now
      completed:    counts.completed,    // done successfully
      failed:       counts.failed,       // errored out
      delayed:      counts.delayed,      // scheduled for future
      stalledCount: await emailQueue.getStalledCount(),
      concurrency:  4
    })
  })
}, 5000)

// On every job complete
worker.on('completed', (job) => {
  fetch('http://tracemind-server/api/job-event', {
    method: 'POST',
    body: JSON.stringify({
      queueName:    'emailQueue',
      jobId:        job.id,
      processingMs: job.finishedOn - job.processedOn, // actual time taken
      attemptsMade: job.attemptsMade,
      maxAttempts:  job.opts.attempts ?? 3,
      status:       'completed'
    })
  })
})
```

---

## Metric Calculations

All calculations happen on the TraceMind server. The business server only sends raw numbers.

### Redis — Storing Previous State

Before calculating anything, we need the **previous snapshot** to compare against. This is stored in Redis (not MongoDB) for speed.

```
Redis keys per queue:
  prev:emailQueue          → { waiting: 40, completed: 1200, ... }
  history:emailQueue       → [205, 198, 210, 200, 195, 202, 208, 197, 203, 199]
  prev:webhookQueue        → { waiting: 12, completed: 890, ... }
  history:webhookQueue     → [150, 160, 145, 155, 148]
```

---

### 1. Growth Rate

**What it tells you:** Is the queue filling up faster than workers can process?

```
Formula:
  growthRate = waiting_now - waiting_previous

Example:
  Previous snapshot: waiting = 40
  Current snapshot:  waiting = 45
  growthRate = 45 - 40 = +5

Interpretation:
  growthRate > 0   → Queue is growing, workers may be slow
  growthRate = 0   → Balanced, workers keeping up
  growthRate < 0   → Queue draining, workers are fast

Thresholds:
  > 5  jobs/interval → Warning
  > 20 jobs/interval → Critical
```

---

### 2. Failure Rate

**What it tells you:** What percentage of jobs are failing?

```
Formula:
  total       = completed + failed
  failureRate = (failed / total) * 100

Example:
  completed = 1200
  failed    = 23
  total     = 1223
  rate      = (23 / 1223) * 100 = 1.88%

Why NOT include waiting/active in total?
  Because their result is unknown yet.
  We only measure jobs that have finished (success or fail).

Thresholds:
  < 2%   → Healthy
  2-10%  → Warning
  > 10%  → Critical
```

---

### 3. Average Processing Time (avgProcessingMs)

**What it tells you:** How long does a typical job take?

```
Source:
  processingMs = job.finishedOn - job.processedOn
  (sent by business server on each job completion)

Storage:
  Last 10 values stored in Redis list per queue:
  history:emailQueue → [205, 198, 210, 200, 195, 202, 208, 197, 203, 199]
                        ↑ latest first (lpush)

Formula:
  avgProcessingMs = sum(history) / count(history)

Example:
  history = [205, 198, 210, 200, 195, 202, 208, 197, 203, 199]
  sum     = 2017
  count   = 10
  avg     = 2017 / 10 = 201.7ms ≈ 202ms

Note:
  If history has fewer than 5 entries, avgProcessingMs = 0
  We need enough data before making judgments.
```

---

### 4. Z-Score

**What it tells you:** Is the latest job processing time abnormal compared to history?

```
Why not just compare to average?
  Consider two queues:

  Queue A history: [200, 201, 199, 202, 200]  avg=200ms, very consistent
  Queue B history: [50, 400, 80, 350, 100]    avg=196ms, very inconsistent

  Both queues get a job taking 300ms.

  For Queue A → 300ms is clearly abnormal (avg is 200, tiny variation)
  For Queue B → 300ms is totally normal (it swings between 50-400 anyway)

  Z-Score handles this correctly by measuring how many "spreads" away
  the current value is from the average.

Formula:
  Step 1 — Mean (average):
    mean = sum(history) / count

  Step 2 — Variance (how spread out values are):
    variance = sum((each_value - mean)²) / count

  Step 3 — Standard Deviation (spread in same unit as data):
    stdDev = sqrt(variance)

  Step 4 — Z-Score:
    zScore = (current_value - mean) / stdDev

Example — Queue A (consistent):
  history = [200, 201, 199, 202, 200, 201, 198, 200, 202, 199]
  mean    = 200.2ms
  stdDev  = 1.2ms       ← very small spread

  Current job = 350ms
  zScore = (350 - 200.2) / 1.2 = 124.8 → MASSIVE ANOMALY 🚨

Example — Queue B (inconsistent):
  history = [50, 400, 80, 350, 100, 420, 60, 380, 90, 300]
  mean    = 223ms
  stdDev  = 145ms       ← huge spread, this queue is naturally volatile

  Current job = 350ms
  zScore = (350 - 223) / 145 = 0.87 → NORMAL ✅

Thresholds:
  Z < 2   → Normal
  Z 2–3   → Suspicious, log it
  Z > 3   → Anomaly, send alert
```

---

### 5. Ghost Failure Detection

**What it tells you:** Workers appear dead but system reports no error.

```
Three conditions must ALL be true simultaneously:

  1. waiting > 0        → there are jobs to be processed
  2. active == 0        → no worker is currently processing
  3. completed_now == completed_before  → nothing got done since last check

Example:
  Previous:  waiting=45, active=3, completed=1200
  Current:   waiting=52, active=0, completed=1200  ← completed didn't change!

  Condition 1: 52 > 0          = true ✓
  Condition 2: 0 == 0          = true ✓
  Condition 3: 1200 == 1200    = true ✓

  GHOST FAILURE DETECTED 💀

  System was returning 200 OK on all health checks.
  But 52 jobs are stuck and going nowhere.
```

---

### 6. Retry Storm Detection

**What it tells you:** A job is failing repeatedly in an infinite retry loop.

```
Formula:
  isRetryStorm = attemptsMade >= (maxAttempts * 0.7)

Example:
  maxAttempts  = 3
  threshold    = 3 * 0.7 = 2.1

  attemptsMade = 1 → 1 >= 2.1  = false → Normal
  attemptsMade = 2 → 2 >= 2.1  = false → Normal (just one retry)
  attemptsMade = 3 → 3 >= 2.1  = true  → RETRY STORM 🔁

Why 0.7 threshold and not 1.0?
  At 0.7 we catch it BEFORE the last attempt.
  This gives time to alert and intervene before the job fully exhausts.

Pattern to watch:
  If multiple jobs of the SAME type are all retry storming,
  the problem is NOT the jobs — it's the downstream service they call.
  Example: 5 DB write jobs all retrying → Database is probably down.
```

---

### 7. Redis Hit Rate

**What it tells you:** Is your cache actually working?

```
Formula:
  total   = keyspaceHits + keyspaceMisses
  hitRate = (keyspaceHits / total) * 100

Example:
  keyspaceHits   = 900
  keyspaceMisses = 100
  total          = 1000
  hitRate        = (900 / 1000) * 100 = 90% ← Good

Another example:
  keyspaceHits   = 400
  keyspaceMisses = 600
  hitRate        = 40% ← Cache is barely working, most requests going to DB

Thresholds:
  > 80%  → Healthy
  60-80% → Warning, review cache strategy
  < 60%  → Critical, cache not effective
```

---

### 8. CPU Usage

**What it tells you:** How busy is the server processor?

```
Why not just read it directly?
  os.cpus() gives cumulative ticks since boot, not current %.
  We need two readings with a gap to calculate the difference.

Formula:
  reading1 = os.cpus()     → {user, sys, idle, irq} per core
  wait 100ms
  reading2 = os.cpus()

  idleDiff  = reading2.idle  - reading1.idle
  totalDiff = reading2.total - reading1.total
  cpuPercent = (1 - idleDiff / totalDiff) * 100

Example:
  reading1.idle  = 8000ms,  reading1.total = 10000ms
  reading2.idle  = 8080ms,  reading2.total = 10200ms

  idleDiff  = 8080 - 8000 = 80ms
  totalDiff = 10200 - 10000 = 200ms
  cpuPercent = (1 - 80/200) * 100 = 60%

Thresholds:
  < 70%  → Healthy
  70-85% → Warning
  > 85%  → Critical — jobs may start queuing up
```

---

### 9. Memory Usage

```
Formula:
  memUsedMB      = memTotalMB - memFreeMB
  memUsedPercent = (memUsedMB / memTotalMB) * 100

Example:
  memTotalMB = 16384 MB  (16 GB)
  memFreeMB  =  6000 MB
  memUsedMB  = 10384 MB
  usedPercent = (10384 / 16384) * 100 = 63.4%

Thresholds:
  < 75%  → Healthy
  75-90% → Warning — GC pressure increases, latency may spike
  > 90%  → Critical — OOM kill risk, process may crash
```

---

## Anomaly Detection

Every snapshot goes through a status decision tree:

```
                    ┌─────────────────────┐
                    │   New Snapshot      │
                    └──────────┬──────────┘
                               ↓
                    ┌─────────────────────┐
                    │  isGhostFailure?    │ ──── YES ──► status = "ghost_failure"
                    └──────────┬──────────┘              alert: "Workers dead"
                               NO
                               ↓
              ┌────────────────────────────────┐
              │ failureRate > 10%              │
              │ OR growthRate > 20             │ ── YES ──► status = "critical"
              └────────────────┬───────────────┘
                               NO
                               ↓
              ┌────────────────────────────────┐
              │ failureRate > 2%               │
              │ OR growthRate > 5              │ ── YES ──► status = "warning"
              │ OR zScore > 2                  │
              └────────────────┬───────────────┘
                               NO
                               ↓
                    ┌─────────────────────┐
                    │  status = "healthy" │
                    └─────────────────────┘
```

### Status Levels

| Status | Meaning | Example |
|---|---|---|
| `healthy` | Everything normal | failureRate=1%, growthRate=2 |
| `warning` | Something to watch | failureRate=5%, zScore=2.5 |
| `critical` | Action needed now | failureRate=15%, growthRate=30 |
| `ghost_failure` | Silent death | waiting=45, active=0, completed unchanged |

---

## AI Explanation Engine

TraceMind uses **Groq AI (Kimi K2)** to explain anomalies in plain language.

### When AI is Called

```
status = "healthy"       → NO AI call (save tokens, return default message)
status = "warning"       → AI called ✓
status = "critical"      → AI called ✓
status = "ghost_failure" → AI called ✓
```

### How It Works

```
1. Anomaly detected in snapshot

2. Build message with all context:
   - Type (queue/redis/system)
   - Status and alerts
   - Raw numbers
   - Calculated metrics

3. Send to Groq with strict JSON system prompt:
   "Respond ONLY in this JSON format, no extra text..."

4. Parse the JSON response

5. Attach to WebSocket broadcast
```

### System Prompt (Strict)

```
You are a backend infrastructure monitoring AI.
Respond ONLY in this exact JSON format:

{
  "summary":   "one line — what is happening",
  "reason":    "why this might be happening",
  "action":    "what should be done immediately",
  "severity":  "low | medium | high | critical",
  "isAnomaly": true or false
}

Rules:
- summary under 15 words
- reason under 20 words
- action under 20 words
- Respond in Hinglish
- No markdown, pure JSON only
```

### Example Input → Output

**Input (Ghost Failure detected):**
```json
{
  "type": "queue",
  "queueName": "emailQueue",
  "status": "ghost_failure",
  "alertMessage": ["Workers dead — 45 jobs stuck hain"],
  "raw": {
    "waiting": 45,
    "active":   0,
    "completed": 1200
  },
  "calculated": {
    "growthRate":     5,
    "isGhostFailure": true
  }
}
```

**AI Output:**
```json
{
  "summary":   "emailQueue ke workers band hain, 45 jobs phasi hain",
  "reason":    "Worker process crash ho gaya ya Redis connection toot gaya",
  "action":    "Workers restart karo aur Redis connection check karo",
  "severity":  "critical",
  "isAnomaly": true
}
```

**Input (High Failure Rate):**
```json
{
  "type": "queue",
  "status": "critical",
  "alertMessage": ["Failure rate 15.2% — critical"],
  "calculated": { "failureRate": 15.2, "zScore": 3.8 }
}
```

**AI Output:**
```json
{
  "summary":   "webhookQueue mein 15% jobs fail ho rahi hain",
  "reason":    "External webhook endpoint down ya timeout aa raha hai",
  "action":    "Failed jobs ke error logs dekho, endpoint health check karo",
  "severity":  "high",
  "isAnomaly": true
}
```

---

## WebSocket — Live Updates

TraceMind uses **Socket.IO** to push live updates to the dashboard the moment data is received.

### Flow

```
Business server sends data
         ↓
TraceMind receives, calculates, saves to MongoDB
         ↓
Calls broadcastSnapshot()
         ↓
Groq AI generates explanation (only if not healthy)
         ↓
io.emit('snapshot:queue', { ...data, aiExplanation })
         ↓
All connected dashboards receive update instantly ✅
```

### Events Emitted

| Event | When | Payload |
|---|---|---|
| `snapshot:queue` | Every queue snapshot | Queue metrics + AI explanation |
| `snapshot:redis` | Every redis snapshot | Redis metrics + AI explanation |
| `snapshot:system` | Every system snapshot | CPU/Memory + AI explanation |
| `alert` | When status is critical or ghost_failure | Alert details + AI explanation |

### Dashboard Integration Example

```javascript
import { io } from 'socket.io-client'

const socket = io('http://tracemind-server:3000')

// Live queue updates
socket.on('snapshot:queue', (data) => {
  console.log(data)
  // {
  //   type:          "queue",
  //   queueName:     "emailQueue",
  //   status:        "warning",
  //   alertMessage:  ["Failure rate 5%", "Queue growing +8"],
  //   calculated: {
  //     growthRate:      8,
  //     failureRate:     5.0,
  //     avgProcessingMs: 202,
  //     zScore:          2.3,
  //     isGhostFailure:  false
  //   },
  //   raw: {
  //     waiting: 45, active: 3, completed: 1200, failed: 64
  //   },
  //   aiExplanation: {
  //     summary:   "emailQueue mein failure rate badh rahi hai",
  //     reason:    "Downstream email service slow respond kar raha hai",
  //     action:    "Email provider status check karo, retry delay badhao",
  //     severity:  "medium",
  //     isAnomaly: true
  //   },
  //   capturedAt: "2024-01-15T10:30:00.000Z"
  // }
})

// Critical alerts only
socket.on('alert', (data) => {
  // Show notification, play sound, send to Slack etc.
  showNotification(data.aiExplanation.summary)
})

// Redis updates
socket.on('snapshot:redis', (data) => { ... })

// System updates
socket.on('snapshot:system', (data) => { ... })
```

### First Connection — History Load

When a dashboard first connects, it requests the last 50 snapshots to show historical charts.

```javascript
// On first connect
socket.emit('get:history', { queueName: 'emailQueue', limit: 50 })

socket.on('history:queue', (snapshots) => {
  // Array of last 50 QueueSnapshot documents
  renderChart(snapshots)
})
```

---

## API Reference

### POST /api/queue-snapshot
Receives queue and worker metrics from business server.

**Request Body:**
```json
{
  "queueName":    "string — BullMQ queue name",
  "waiting":      "number — jobs pending",
  "active":       "number — being processed now",
  "completed":    "number — finished successfully",
  "failed":       "number — errored out",
  "delayed":      "number — scheduled for future",
  "stalledCount": "number — workers died mid-job",
  "concurrency":  "number — parallel workers allowed"
}
```

**Response:**
```json
{
  "status":  true,
  "message": "Snapshot noted"
}
```

---

### POST /api/job-event
Receives individual job completion or failure event.

**Request Body:**
```json
{
  "queueName":    "string",
  "jobId":        "string — BullMQ job ID",
  "jobName":      "string — job type name",
  "processingMs": "number — time taken in ms",
  "attemptsMade": "number — how many times tried",
  "maxAttempts":  "number — max retries allowed",
  "status":       "completed | failed",
  "errorMsg":     "string | null"
}
```

---

### POST /api/system-snapshot
Receives OS, CPU, and memory metrics.

**Request Body:**
```json
{
  "cpuPercent":    "number — 0 to 100",
  "memTotalMB":    "number",
  "memFreeMB":     "number",
  "loadAvg1m":     "number — 1 minute load average",
  "loadAvg5m":     "number",
  "loadAvg15m":    "number",
  "coreCount":     "number",
  "processHeapMB": "number — Node.js heap",
  "processRssMB":  "number — Node.js RSS",
  "platform":      "string — linux | darwin | win32",
  "nodeVersion":   "string",
  "uptime":        "number — seconds",
  "processUptime": "number — seconds"
}
```

---

### POST /api/redis-snapshot
Receives Redis health metrics.

**Request Body:**
```json
{
  "latencyMs":        "number — ping response time",
  "memUsedMB":        "number",
  "memMaxMB":         "number — 0 means unlimited",
  "connectedClients": "number",
  "commandsPerSec":   "number",
  "evictedKeys":      "number — keys deleted due to memory pressure",
  "keyspaceHits":     "number",
  "keyspaceMisses":   "number"
}
```

---

## Database Schema

All collections store both **raw data** (what business sent) and **calculated metrics** (what TraceMind computed). This allows future analysis on both levels.

### QueueSnapshot

```typescript
{
  queueName: string,

  raw: {
    waiting, active, completed, failed, delayed, stalledCount, concurrency
  },

  calculated: {
    growthRate,       // waiting_now - waiting_prev
    failureRate,      // failed / (failed+completed) * 100
    avgProcessingMs,  // moving average of last 10 jobs
    zScore,           // how abnormal is latest job time
    isGhostFailure    // silent death detection
  },

  status:     "healthy | warning | critical | ghost_failure",
  alerts:     ["array of alert messages"],
  capturedAt: Date
}
```

**Indexes:**
- `{ queueName: 1, capturedAt: -1 }` — fast dashboard queries
- `{ capturedAt: 1 }` with TTL 10 days — auto cleanup

### JobEvent

```typescript
{
  queueName, jobId, jobName,
  processingMs, attemptsMade, maxAttempts,
  status, errorMsg,

  calculated: {
    isRetryStorm,  // attemptsMade >= maxAttempts * 0.7
    isAnomaly,     // zScore > 3
    zScore,
    avgAtTime      // what was the avg when this job ran
  },

  timestamp: Date
}
```

**TTL:** 10 days (job events generate high volume)

### SystemSnapshot

```typescript
{
  raw: {
    cpuPercent, memTotalMB, memFreeMB,
    loadAvg1m, loadAvg5m, loadAvg15m,
    coreCount, processHeapMB, processRssMB,
    platform, nodeVersion, uptime, processUptime
  },

  calculated: {
    memUsedMB,       // totalMB - freeMB
    memUsedPercent,  // usedMB / totalMB * 100
    isHighCPU,       // cpu > 85
    isHighMemory     // memUsed > 90
  },

  status, alerts, capturedAt
}
```

### RedisSnapshot

```typescript
{
  raw: {
    latencyMs, memUsedMB, memMaxMB,
    connectedClients, commandsPerSec,
    evictedKeys, keyspaceHits, keyspaceMisses
  },

  calculated: {
    hitRate,         // hits / (hits+misses) * 100
    memUsedPercent,  // memUsed / memMax * 100
    isHighLatency,   // latency > 100ms
    isEvicting,      // evictedKeys > 0
    isLowHitRate     // hitRate < 60%
  },

  status, alerts, capturedAt
}
```

---

## Environment Variables

```env
MONGO_URI=mongodb://localhost:27017/tracemind
REDIS_HOST=localhost
REDIS_PORT=6379
GROQ_API_KEY=your_groq_api_key_here
PORT=3000
```

---

## Tech Stack

| Technology | Purpose |
|---|---|
| Node.js + TypeScript | Core backend |
| Express.js | HTTP server and routes |
| MongoDB + Mongoose | Persistent storage (10 day retention) |
| Redis (ioredis) | Previous state storage, processing history |
| Socket.IO | Real-time WebSocket broadcasts |
| Groq AI (Kimi K2) | Natural language anomaly explanation |
| BullMQ | Queue monitoring (on business server side) |

---

*TraceMind — Because "everything looks fine" is not a monitoring strategy.*