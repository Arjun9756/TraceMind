import { RawData } from '../Routes/Queue.route'
import { addToBuffer } from '../Utility/BulkBuffer'
import { getIO } from '../Websocket/Websocket'
import generateChat from '../Utility/Groq.AI'
const io = getIO()
import { QUEUE_SYSTEM_PROMPT } from '../Promtps/GroqPrompts'
import calculateQueue from '../BusinessLogic/Queue.logic'

export async function QueueEventHandler(rawData: RawData) {
    try {
        const queueResponse = await calculateQueue(rawData)

        // Bull MQ Auto Retry in Future
        if (!queueResponse) {
            return
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
            console.log("Queue Event Emit")
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
    }
    catch (error: any) {
        console.log("Queue Snapshot Error")
    }
}