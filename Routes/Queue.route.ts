import express, { Request, Response } from 'express'
import { QueueSnapshot } from '../Models/QueueSnapshot.model'
import calculateQueue from '../BusinessLogic/Queue.logic'
import { getIO } from '../Websocket/Websocket'
import generateChat from '../Utility/Groq.AI'
import { addToBuffer } from '../Utility/BulkBuffer'
import rateLimiter from '../Server Security/RateLimit'
import { produceItem } from '../Kafka/KafkaProducer'

const io = getIO()
export const router = express.Router()

export interface RawData {
    queueName: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    stalledCount: number;
    concurrency: number;
}

router.get("/", (req: Request, res: Response) => {
    return res.status(202).json({
        status: true,
        message: "Queue Get Request"
    })
})

// PROMPT PART
const QUEUE_SYSTEM_PROMPT = `Analyze queue data. Response ONLY JSON: {"summary": "brief (15 words)", "reason": "why (20 words)", "action": "fix (20 words)", "severity": "low|medium|high|critical", "isAnomaly": bool}
Rules: waiting>0+active=0=CRITICAL, failure>10%=HIGH, growth>20%=WARNING, stalledCount>0=HIGH, zScore>3=ANOMALY`

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

        // Message PART - Compact format to reduce tokens
        const message = `Queue:${rawData.queueName} Wait:${rawData.waiting} Active:${rawData.active} Failed:${rawData.failed} Stalled:${rawData.stalledCount} Growth:${calculated.growthRate}% Failure:${calculated.failureRate}% ZScore:${calculated.zScore} Ghost:${calculated.isGhostFailure}`

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

            io.emit('groqQueueAnalyse', aiExplanation)
            console.log(`AI Explain ${cleaned}`)
        }
        catch (error: any) {
            aiExplanation = {
                summary: `${rawData.queueName} queue mein ${status} issue detected.`,
                reason: 'No AI Response Generated.',
                action: 'Check Queue Logs and Workers.',
                severity: status,
                isAnomaly: true,
            }

            io.emit('groqQueueAnalyse', aiExplanation)
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

        addToBuffer({
            type: "queue",
            data: {
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
            }
        })

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

router.post('/v2', async (req, res) => {
    const rawData = req.body
    if (!rawData) {
        return res.status(402).json({
            status: false,
            message: "Queue Data is Required"
        })
    }

    try {
        const kafkaTopic = 'TraceMindTaskEvents'
        await produceItem(kafkaTopic, JSON.stringify(rawData), 'QueueEvent', 0)
        return res.status(202).json({
            status: true,
            message: "Message Stored Successfuly in Database"
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

        let queueResult = await QueueSnapshot
            .find(query)
            .sort({ capturedAt: -1 })
            .limit(5)

        let newCursorId = null

        if (queueResult.length > 0) {
            newCursorId = queueResult[queueResult.length - 1]!.capturedAt
        }

        return res.status(200).json({
            status: true,
            data: queueResult,
            nextCursor: newCursorId,
        })
    }
    catch (error: any) {
        console.log('Error fetching queue results:', error.message)
        return res.status(200).json({
            status: false,
            data: [],
            nextCursor: null,
            hasMore: false
        })
    }
})