import express from 'express'
import redis from '../Utility/Redis.config'
import { RedisSnapshot, IRedisSnapshot } from '../Models/RedisEvent.model'
import getRedisResult from '../BusinessLogic/Redis.logic'
import { getIO } from '../Websocket/Websocket'
import generateChat from '../Utility/Groq.AI'

const router = express.Router()
const io = getIO()

router.get('/', (req, res) => {
    return res.status(200).json({
        status: true,
        message: "Redis Route is Working"
    })
})

const REDIS_SYSTEM_PROMPT = `
You are a backend infrastructure monitoring AI specializing in Redis monitoring.
You will receive real-time Redis snapshot data including latency, memory, hit rate, and eviction metrics.
Your job is to analyze it and respond ONLY in this exact JSON format — no extra text, no markdown, no explanation outside JSON:

{
  "summary": "one line — what is happening",
  "reason": "why this might be happening", 
  "action": "what should be done immediately",
  "severity": "low | medium | high | critical",
  "isAnomaly": true or false
}

Redis-specific Analysis Rules:
- Latency > 100ms: HIGH — slow queries affecting performance
- Latency > 500ms: CRITICAL — Redis bottleneck, check slowlog
- Memory > 90%: CRITICAL — evictions happening, data loss risk
- Memory 80-90%: HIGH — scale memory or enable eviction policy
- Hit Rate < 70%: WARNING — cache inefficiency, review keys
- Hit Rate < 50%: HIGH — major cache misses, optimize queries
- Evicted Keys > 0: WARNING — memory pressure, keys being dropped
- Evicted Keys > 1000: HIGH — significant data loss
- Connected Clients > 10000: HIGH — connection limit approaching

Severity Guide:
- low = healthy, all metrics normal
- medium = one metric warning (latency 50-100ms, memory 70-80%)
- high = multiple warnings or one critical metric
- critical = memory full, high latency, or mass evictions

Word Limits:
- summary: under 15 words
- reason: under 20 words
- action: under 20 words

Response Language: Hinglish (Hindi + English mix)
Output: Pure JSON only, no markdown, no extra fields
`

router.post('/', async (req, res) => {
    const rawData: IRedisSnapshot['raw'] = req.body
    try {
        const { calculated, alertMessage, status } = getRedisResult(rawData)
        const insertion = await RedisSnapshot.insertOne({
            raw: {
                latencyMs: Number(rawData.latencyMs),
                memUsedMB: Number(rawData.memUsedMB),
                memMaxMB: Number(rawData.memMaxMB),
                connectedClients: Number(rawData.connectedClients),
                commandPerSec: Number(rawData.commandPerSec),
                evictedKeys: Number(rawData.evictedKeys),
                keySpaceHits: Number(rawData.keySpaceHits),
                keySpaceMisses: Number(rawData.keySpaceMisses)
            },
            calculated,
            status,
            alertMessage
        })

        const message = `
REDIS ALERT

Status: ${status.toUpperCase()}
Alerts: ${alertMessage || 'None'}

RAW REDIS DATA:
- Latency: ${rawData.latencyMs} ms
- Memory Used: ${rawData.memUsedMB} MB
- Memory Max: ${rawData.memMaxMB} MB
- Connected Clients: ${rawData.connectedClients}
- Commands Per Second: ${rawData.commandPerSec}
- Evicted Keys: ${rawData.evictedKeys}
- Keyspace Hits: ${rawData.keySpaceHits}
- Keyspace Misses: ${rawData.keySpaceMisses}

CALCULATED METRICS:
- Hit Rate: ${calculated.hitRate}%
- Memory Used Percent: ${calculated.memUsedPercent}%
- High Latency: ${calculated.isHighLatency ? 'YES' : 'NO'}
- Is Evicting: ${calculated.isEvicting ? 'YES' : 'NO'}
- Low Hit Rate: ${calculated.isLowHitRate ? 'YES' : 'NO'}

Analyze this Redis snapshot and provide actionable insights in Hinglish.
`
        const { response, reasoning } = await generateChat(message, REDIS_SYSTEM_PROMPT)

        io.emit("redisSnapshot", {
            raw: {
                latencyMs: Number(rawData.latencyMs),
                memUsedMB: Number(rawData.memUsedMB),
                memMaxMB: Number(rawData.memMaxMB),
                connectedClients: Number(rawData.connectedClients),
                commandPerSec: Number(rawData.commandPerSec),
                evictedKeys: Number(rawData.evictedKeys),
                keySpaceHits: Number(rawData.keySpaceHits),
                keySpaceMisses: Number(rawData.keySpaceMisses)
            },
            calculated,
            status,
            alertMessage
        })

        let aiExplanation
        try {
            const cleaned = response
                .trim()
                .replace(/```json/g, '')
                .replace(/```/g, '')
                .trim()
            aiExplanation = JSON.parse(cleaned)
        }
        catch (error: any) {
            console.log(`Error in Redis AI Analysis ${error?.message}`)
            aiExplanation = {
                summary: `Redis mein ${status} issue detected.`,
                reason: 'AI response parse nahi ho paya, manual check karo.',
                action: 'Redis logs aur slowlog check karo immediately.',
                severity: status === 'critical' ? 'critical' : 'high',
                isAnomaly: true,
            }
        }

        io.emit('groqRedisAnalyse', aiExplanation)
        return res.status(200).json({
            status: true,
            message: "Redis Data Inserted"
        })
    }
    catch (error: any) {
        console.log(`Error While Inserting Redis Data ${error?.message}`)
        return res.status(501).json({
            status: false,
            message: "Redis Insertion Error in Trace Mind"
        })
    }
})

export default router