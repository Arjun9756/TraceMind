import getSystemResult from '../BusinessLogic/System.logic'
import generateChat from '../Utility/Groq.AI'
import { addToBuffer } from '../Utility/BulkBuffer'
import { SystemRawData } from '../Routes/System.route'
import { SYSTEM_SYSTEM_PROMPT } from '../Promtps/GroqPrompts'
import { getIO } from '../Websocket/Websocket'
const io = getIO()

export async function SystemEventHandler(rawData:SystemRawData) {
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
        console.log("System Event Emit")

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
    }
    catch (error: any) {
        console.log(`Error While Saving System Data`)
    }
}