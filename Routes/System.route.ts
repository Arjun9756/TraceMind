import express from 'express'
import redis from '../Utility/Redis.config'
import getSystemResult from '../BusinessLogic/System.logic'
import { SystemSnapshot } from '../Models/SystemSnapshot.model'
import { getIO } from '../Websocket/Websocket'
import generateChat from '../Utility/Groq.AI'

const router = express.Router()
const io = getIO()

interface SystemRawData {
    cpuPercent: number,
    memTotalMB: number,
    memFreeMB: number,
    loadAvg1m: number,
    loadAvg5m: number,
    loadAvg15m: number
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
    status: 'health' | 'warning' | 'critical',
    alertMessage: string,
}

router.get('/', (req, res) => {
    return res.status(200).json({
        status: true,
        message: "System Route is Working"
    })
})

const SYSTEM_SYSTEM_PROMPT = `
You are a backend infrastructure monitoring AI specializing in Server/System monitoring.
You will receive real-time system snapshot data including CPU, Memory, Load Average metrics.
Your job is to analyze it and respond ONLY in this exact JSON format — no extra text, no markdown, no explanation outside JSON:

{
  "summary": "one line — what is happening",
  "reason": "why this might be happening", 
  "action": "what should be done immediately",
  "severity": "low | medium | high | critical",
  "isAnomaly": true or false
}

System-specific Analysis Rules:
- CPU > 90%: CRITICAL — immediate scaling needed
- CPU 70-90%: HIGH — monitor closely, prepare scaling
- Memory > 90%: CRITICAL — risk of OOM kills
- Memory 70-90%: HIGH — memory leak possible
- Load Average > Core Count: HIGH — system overloaded
- Load Average > 2x Core Count: CRITICAL — imminent crash
- Heap Memory > 80%: HIGH — Node.js memory pressure
- Disk > 85%: WARNING — cleanup needed

Severity Guide:
- low = healthy, all metrics normal
- medium = warning, one metric elevated
- high = multiple metrics high, performance degraded
- critical = system at risk of crash/failure

Word Limits:
- summary: under 15 words
- reason: under 20 words
- action: under 20 words

Response Language: Hinglish (Hindi + English mix)
Output: Pure JSON only, no markdown, no extra fields
`

router.post('/', async (req, res) => {
    const rawData: SystemRawData = req.body
    try {
        const response = getSystemResult(rawData)
        if (response) {
            const systemData = await SystemSnapshot.insertOne({
                raw: {
                    cpuPercent: Number(rawData.cpuPercent),
                    memTotalMB: Number(rawData.memTotalMB),
                    memFreeMB: Number(rawData.memFreeMB),
                    loadAvg1M: Number(rawData.loadAvg1m),
                    loadAvg5M: Number(rawData.loadAvg5m),
                    loadAvg15M: Number(rawData.loadAvg15m),
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
            })
        }
        else {
            const systemData = await SystemSnapshot.insertOne({
                raw: {
                    cpuPercent: Number(rawData.cpuPercent),
                    memTotalMB: Number(rawData.memTotalMB),
                    memFreeMB: Number(rawData.memFreeMB),
                    loadAvg1M: Number(rawData.loadAvg1m),
                    loadAvg5M: Number(rawData.loadAvg5m),
                    loadAvg15M: Number(rawData.loadAvg15m),
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
            })
        }

        const message = `
SYSTEM ALERT

Status: ${response?.status.toUpperCase()}
Alerts: ${response?.alertMessage || 'None'}

RAW SYSTEM DATA:
- CPU Usage: ${rawData.cpuPercent}%
- Total Memory: ${rawData.memTotalMB} MB
- Free Memory: ${rawData.memFreeMB} MB
- Load Average (1m): ${rawData.loadAvg1m}
- Load Average (5m): ${rawData.loadAvg5m}
- Load Average (15m): ${rawData.loadAvg15m}
- Core Count: ${rawData.coreCount}
- Process Heap: ${rawData.processHeapMB} MB
- Platform: ${rawData.platform}
- Uptime: ${rawData.uptime} seconds
- Process Uptime: ${rawData.processUptime} seconds

CALCULATED METRICS:
- Memory Used: ${response?.calculated.memUsedMB} MB
- Memory Used Percent: ${response?.calculated.memUsedPercent}%
- High CPU: ${response?.calculated.isHighCPU ? 'YES' : 'NO'}
- High Memory: ${response?.calculated.isHighMemory ? 'YES' : 'NO'}

Analyze this system snapshot and provide actionable insights in Hinglish.
`

        const { response: groqResponse, reasoning } = await generateChat(message, SYSTEM_SYSTEM_PROMPT)
        io.emit("systemSnapshot", {
            raw: {
                cpuPercent: Number(rawData.cpuPercent),
                memTotalMB: Number(rawData.memTotalMB),
                memFreeMB: Number(rawData.memFreeMB),
                loadAvg1M: Number(rawData.loadAvg1m),
                loadAvg5M: Number(rawData.loadAvg5m),
                loadAvg15M: Number(rawData.loadAvg15m),
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

        io.emit("groqSystemAnalyse", aiExplanation)
        return res.status(202).json({
            status: true,
            message: "System Data is Recevied"
        })
    }
    catch (error: any) {
        console.log(`Error While Saving System Data`)
    }
})

export default router