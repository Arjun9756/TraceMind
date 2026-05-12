import redis from '../Utility/Redis.config'
import { IRedisSnapshot } from '../Models/RedisEvent.model'
import getRedisResult from '../BusinessLogic/Redis.logic'
import { getIO } from '../Websocket/Websocket'
import generateChat from '../Utility/Groq.AI'
import { addToBuffer } from '../Utility/BulkBuffer'
import rateLimitUser from '../Server Security/RateLimit'
import { REDIS_SYSTEM_PROMPT } from '../Promtps/GroqPrompts'
const io = getIO()

export async function RedisEventHandler(rawData: IRedisSnapshot['raw']) {
    try {
        const { calculated, alertMessage, status } = getRedisResult(rawData)
        addToBuffer({
            type: "redis",
            data: {
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

        if (calculated.isHighLatency || calculated.isLowHitRate || calculated.isEvicting) {
            io.emit('groqRedisAnalyse', aiExplanation)
        }
    }
    catch (error: any) {
        console.log(`Error While Inserting Redis Data ${error?.message}`)
    }
}