import express from 'express'
import redis from '../Utility/Redis.config'
import getSystemResult from '../BusinessLogic/System.logic'
import { SystemSnapshot } from '../Models/SystemSnapshot.model'
import { getIO } from '../Websocket/Websocket'
import generateChat from '../Utility/Groq.AI'
import { addToBuffer } from '../Utility/BulkBuffer'
import rateLimiter from '../Server Security/RateLimit'
import {produceItem} from '../Kafka/KafkaProducer'

const router = express.Router()
const io = getIO()

interface SystemRawData {
    cpuPercent: number,
    memTotalMB: number,
    memFreeMB: number,
    loadAvg1M: number,
    loadAvg5M: number,
    loadAvg15M: number
    coreCount: number,
    processHeapMB: number,
    platform: string,
    uptime: number,
    processUptime: number,
    calculated: {
        memUsedMB: number,
        memUsedPercent: number,
        isHighCpu: boolean,
        isHighMemory: boolean
    },
    status: 'healthy' | 'warning' | 'critical',
    alertMessage: string,
}

router.get('/', (req, res) => {
    return res.status(200).json({
        status: true,
        message: "System Route is Working"
    })
})

const SYSTEM_SYSTEM_PROMPT = `Analyze system metrics. Response ONLY JSON: {"summary": "brief (15 words)", "reason": "why (20 words)", "action": "fix (20 words)", "severity": "low|medium|high|critical", "isAnomaly": bool}
Rules: cpu>90%=CRITICAL, cpu>70%=HIGH, memory>90%=CRITICAL, memory>70%=HIGH, load>cores=HIGH, load>2x=CRITICAL`

router.post('/', async (req, res) => {
    const rawData: SystemRawData = req.body
    try {
        const response = getSystemResult(rawData)
        if (response) {
            addToBuffer({
                type: "system",
                data: {
                    raw: {
                        cpuPercent: Number(rawData.cpuPercent),
                        memTotalMB: Number(rawData.memTotalMB),
                        memFreeMB: Number(rawData.memFreeMB),
                        loadAvg1M: Number(rawData.loadAvg1M),
                        loadAvg5M: Number(rawData.loadAvg5M),
                        loadAvg15M: Number(rawData.loadAvg15M),
                        processHeapMB: Number(rawData.processHeapMB),
                        coreCount: Number(rawData.coreCount),
                        platform: rawData.platform,
                        uptime: Number(rawData.uptime),
                        processUptime: Number(rawData.processUptime),
                    },
                    calculated: {
                        memUsedMB: response.calculated.memUsedMB,
                        isHighCPU: response.calculated.isHighCPU,
                        isHighMemory: response.calculated.isHighMemory,
                        memUsedPercent: response.calculated.memUsedPercent
                    },
                    status: response.status,
                    alertMessage: response.alertMessage
                }
            })
        }
        else {
            addToBuffer({
                type: "system",
                data: {
                    raw: {
                        cpuPercent: Number(rawData.cpuPercent),
                        memTotalMB: Number(rawData.memTotalMB),
                        memFreeMB: Number(rawData.memFreeMB),
                        loadAvg1M: Number(rawData.loadAvg1M),
                        loadAvg5M: Number(rawData.loadAvg5M),
                        loadAvg15M: Number(rawData.loadAvg15M),
                        processHeapMB: Number(rawData.processHeapMB),
                        coreCount: Number(rawData.coreCount),
                        platform: rawData.platform,
                        uptime: Number(rawData.uptime),
                        processUptime: Number(rawData.processUptime),
                    },
                    calculated: {
                        memUsedMB: 0,
                        isHighCPU: false,
                        isHighMemory: false,
                        memUsedPercent: 0
                    },
                    status: "healthy",
                    alertMessage: "No Data is Processed With This Query"
                }
            })
        }

        const message = `CPU:${rawData.cpuPercent}% Mem:${rawData.memFreeMB}/${rawData.memTotalMB}MB Load:${rawData.loadAvg1M}/${rawData.loadAvg5M}/${rawData.loadAvg15M} Cores:${rawData.coreCount} Heap:${rawData.processHeapMB}MB MemUsed:${response?.calculated.memUsedMB}MB MemPercent:${response?.calculated.memUsedPercent}% HighCPU:${response?.calculated.isHighCPU} HighMem:${response?.calculated.isHighMemory}`

        const { response: groqResponse, reasoning } = await generateChat(message, SYSTEM_SYSTEM_PROMPT)
        io.emit("systemSnapshot", {
            raw: {
                cpuPercent: Number(rawData.cpuPercent),
                memTotalMB: Number(rawData.memTotalMB),
                memFreeMB: Number(rawData.memFreeMB),
                loadAvg1M: Number(rawData.loadAvg1M),
                loadAvg5M: Number(rawData.loadAvg5M),
                loadAvg15M: Number(rawData.loadAvg15M),
                processHeapMB: Number(rawData.processHeapMB),
                coreCount: Number(rawData.coreCount),
                platform: rawData.platform,
                uptime: Number(rawData.uptime),
                processUptime: Number(rawData.processUptime),
            },
            calculated: {
                memUsedMB: response?.calculated.memUsedMB,
                isHighCPU: response?.calculated.isHighCPU,
                isHighMemory: response?.calculated.isHighMemory,
                memUsedPercent: response?.calculated.memUsedPercent
            },
            status: response?.status,
            alertMessage: response?.alertMessage
        })

        let aiExplanation
        try {
            const cleaned = groqResponse
                .trim()
                .replace(/```json/g, '')
                .replace(/```/g, '')
                .trim()
            aiExplanation = JSON.parse(cleaned)
            console.log(aiExplanation)
        }
        catch (error: any) {
            console.log(`Error While Parsing AI Response ${error?.message}`)
            aiExplanation = {
                summary: `System mein ${status} issue detected.`,
                reason: 'AI response parse nahi ho paya, manual check karo.',
                action: 'System logs aur metrics check karo immediately.',
                severity: status === 'critical' ? 'critical' : 'high',
                isAnomaly: true,
            }
        }

        if (response?.calculated.isHighCPU || response?.calculated.isHighMemory) {
            io.emit("groqSystemAnalyse", aiExplanation)
        }

        return res.status(202).json({
            status: true,
            message: "System Data is Recevied"
        })
    }
    catch (error: any) {
        console.log(`Error While Saving System Data`)
    }
})

router.post('/v2', async (req, res) => {
    const rawData: SystemRawData = req.body
    if (!rawData) {
        return res.status(402).json({
            status: false,
            message: "No Data is Provided"
        })
    }

    try {
        const kafkaTopic = 'TraceMindTaskEvents'
        await produceItem(kafkaTopic, JSON.stringify(rawData), 'SystemEvent', 0)
        return res.status(200).json({
            status: true,
            message: "Redis Data Inserted"
        })
    }
    catch (error: any) {
        console.log(`Error in TraceMind Kafka ${error?.message}`)
        return res.status(501).json({
            status: false,
            message: "TraceMind Internal Server Error"
        })
    }
})

router.get('/result', rateLimiter, async (req, res) => {
    let { cursorId } = req.query
    try {
        let query: any = {}

        if (cursorId && cursorId !== 'null') {
            query.capturedAt = { $lt: new Date(cursorId as string) }
        }

        let systemResult = await SystemSnapshot
            .find(query)
            .sort({ capturedAt: -1 })
            .limit(5)

        let newCursorId = null

        if (systemResult.length > 0) {
            newCursorId = systemResult[systemResult.length - 1]!.capturedAt
        }

        return res.status(200).json({
            status: true,
            data: systemResult,
            nextCursor: newCursorId,
        })
    }
    catch (error: any) {
        console.log('Error fetching system results:', error.message)
        return res.status(200).json({
            status: false,
            data: [],
            nextCursor: null
        })
    }
})

export default router