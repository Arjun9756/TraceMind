import express, { Request, Response } from 'express'
import { QueueSnapshot } from '../Models/QueueSnapshot.model'
import calculateQueue from '../BusinessLogic/Queue.logic'
import { getIO } from '../Websocket/Websocket'
import generateChat from '../Utility/Groq.AI'

const io = getIO()
const router = express.Router()
router.get("/", (req: Request, res: Response) => {
    return res.status(202).json({
        status: true,
        message: "Queue Get Request"
    })
})

// PROMPT PART
const QUEUE_SYSTEM_PROMPT = `
You are a backend infrastructure monitoring AI specializing in Bull Queue monitoring.
You will receive real-time queue snapshot data from Bull/BullMQ queues.
Your job is to analyze it and respond ONLY in this exact JSON format — no extra text, no markdown, no explanation outside JSON:

{
  "summary": "one line — what is happening",
  "reason": "why this might be happening", 
  "action": "what should be done immediately",
  "severity": "low | medium | high | critical",
  "isAnomaly": true or false
}

Queue-specific Analysis Rules:
- Ghost Failure: waiting > 0, active = 0, workers not picking jobs → CRITICAL
- High Failure Rate: failureRate > 10% → HIGH severity
- Queue Growth: growthRate > 20% consistently → WARNING
- Stalled Jobs: stalledCount > 0 → investigate workers
- Z-Score > 3: unusual spike in queue size → ANOMALY

Severity Guide:
- low = healthy, normal operations
- medium = warning, needs attention but not urgent
- high = critical failure rate or high latency
- critical = ghost failure, system down, workers dead

Word Limits:
- summary: under 15 words
- reason: under 20 words
- action: under 20 words

Response Language: Hinglish (Hindi + English mix)
Output: Pure JSON only, no markdown, no extra fields
`

// PROMPT PART END

router.post("/", async (req: Request, res: Response) => {
    try {
        const rawData = req.body
        const queueResponse = await calculateQueue(rawData)

        // Bull MQ Auto Retry in Future
        if (!queueResponse) {
            return res.status(501).json({
                status: false,
                message: "Internal Server Error in Trace Mind"
            })
        }

        const { status, calculated, alertMessage } = queueResponse

        // Message PART
        const message = `
        QUEUE ALERT

            Queue Name: ${rawData.queueName}
            Status: ${status.toUpperCase()}
            Alerts: ${alertMessage || 'None'}

            RAW QUEUE DATA:
            - Waiting Jobs: ${rawData.waiting}
            - Active Jobs: ${rawData.active}
            - Completed Jobs: ${rawData.completed}
            - Failed Jobs: ${rawData.failed}
            - Stalled Count: ${rawData.stalledCount}
            - Concurrency: ${rawData.concurrency}

            CALCULATED METRICS:
            - Growth Rate: ${calculated.growthRate}%
            - Failure Rate: ${calculated.failureRate}%
            - Avg Processing Time: ${calculated.avgProcessingMs}ms
            - Z-Score: ${calculated.zScore}
            - Ghost Failure Detected: ${calculated.isGhostFailure ? 'YES' : 'NO'}

            Analyze this queue snapshot and provide actionable insights in Hinglish.
            `

        // Message PART END

        const { response, reasoning } = await generateChat(message, QUEUE_SYSTEM_PROMPT)
        let aiExplanation

        try {
            const cleaned = response.trim().replace(/```json/g, ``).replace(/```/g, '').trim()
            aiExplanation = JSON.parse(cleaned)

            io.emit('queueSnapshot', {
                queueName: rawData.queueName,
                raw: {
                    waiting: rawData.waiting,
                    active: rawData.active,
                    completed: rawData.completed,
                    failed: rawData.failed,
                    stalledCount: rawData.stalledCount,
                    councurrency: rawData.concurrency,
                },
                calculated,
                status,
                alertMessage
            })

            io.emit('groqQueueAnalyse' , aiExplanation)
        }
        catch (error: any) {
            aiExplanation = {
                summary: `${rawData.queueName} queue mein ${status} issue detected.`,
                reason: 'No AI Response Generated.',
                action: 'Check Queue Logs and Workers.',
                severity: status,
                isAnomaly: true,
            }

            io.emit('groqQueueAnalyse' , aiExplanation)
            io.emit('queueSnapshot', {
                queueName: rawData.queueName,
                raw: {
                    waiting: rawData.waiting,
                    active: rawData.active,
                    completed: rawData.completed,
                    failed: rawData.failed,
                    stalledCount: rawData.stalledCount,
                    councurrency: rawData.concurrency,
                },
                calculated,
                status,
                alertMessage
            })
        }

        const snapshot = await QueueSnapshot.create({
            queueName: rawData.queueName,
            raw: {
                waiting: rawData.waiting,
                active: rawData.active,
                completed: rawData.completed,
                failed: rawData.failed,
                stalledCount: rawData.stalledCount,
                councurrency: rawData.concurrency,
            },
            calculated,
            status,
            alertMessage
        })

        await snapshot.save() // Save to mongo db
        return res.status(200).json({
            status: true,
            message: "Snapsot Noted"
        })
    }
    catch (error: any) {
        console.log("Queue Snapshot Error")
        return res.status(501).json({
            status: false,
            message: "Trace Mind Server is Down"
        })
    }
})

export default router