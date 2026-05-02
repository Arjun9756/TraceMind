import express from 'express'
import redis from '../Utility/Redis.config'
import { RedisSnapshot, IRedisSnapshot } from '../Models/RedisEvent.model'
import getRedisResult from '../BusinessLogic/Redis.logic'
import { getIO } from '../Websocket/Websocket'
import generateChat from '../Utility/Groq.AI'
import {addToBuffer} from '../Utility/BulkBuffer'
import rateLimitUser from '../Server Security/RateLimit'

const router = express.Router()
const io = getIO()

router.get('/', (req, res) => {
    return res.status(200).json({
        status: true,
        message: "Redis Route is Working"
    })
})

const REDIS_SYSTEM_PROMPT = `Analyze Redis data. Response ONLY JSON: {"summary": "brief (15 words)", "reason": "why (20 words)", "action": "fix (20 words)", "severity": "low|medium|high|critical", "isAnomaly": bool}
Rules: latency>100ms=HIGH, latency>500ms=CRITICAL, memory>90%=CRITICAL, hitRate<50%=HIGH, evicted>1000=HIGH`

router.post('/', async (req, res) => {
    const rawData: IRedisSnapshot['raw'] = req.body
    try {
        const { calculated, alertMessage, status } = getRedisResult(rawData)
        addToBuffer({
            type:"redis",
            data:{
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
            }
        })

        const message = `Latency:${rawData.latencyMs}ms Mem:${rawData.memUsedMB}/${rawData.memMaxMB}MB Clients:${rawData.connectedClients} Evicted:${rawData.evictedKeys} HitRate:${calculated.hitRate}% MemPercent:${calculated.memUsedPercent}% HighLatency:${calculated.isHighLatency} Evicting:${calculated.isEvicting} LowHitRate:${calculated.isLowHitRate}`
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
            console.log(aiExplanation)
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

        if(calculated.isHighLatency || calculated.isLowHitRate || calculated.isEvicting){
            io.emit('groqRedisAnalyse', aiExplanation)
        }
        
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

router.get('/result', rateLimitUser, async (req, res) => {
    let { cursorId } = req.query
    try {
        let query: any = {}
        
        if (cursorId && cursorId !== 'null') {
            query.capturedAt = { $lt: new Date(cursorId as string) }
        }
        
        let redisResult = await RedisSnapshot
            .find(query)
            .sort({ capturedAt: -1 })
            .limit(5)

        let newCursorId = null
        
        if (redisResult.length > 0) {
            newCursorId = redisResult[redisResult.length - 1]!.capturedAt
        }

        return res.status(200).json({
            status: true,
            data: redisResult,
            nextCursor: newCursorId,
        })
    }
    catch (error: any) {
        console.log('Error fetching redis results:', error.message)
        return res.status(200).json({
            status: false,
            data: [],
            nextCursor: null
        })
    }
})

export default router