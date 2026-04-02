import express from 'express'
import path from 'path'
import { JobEvent } from '../Models/JobEventSchema.model'
import JobEventLogic from '../BusinessLogic/JobEvent.logic'
import { getIO } from '../Websocket/Websocket'
import generateChat from '../Utility/Groq.AI'
const io = getIO()
import { addToBuffer } from '../Utility/BulkBuffer'

interface RawData {
    queueName: string,
    jobId: number,
    processingMs: number,
    attemptMade: number,
    maxAttempt: number,
    status: 'completed' | 'failed',
    errorMessage: string
}

const router = express.Router()
router.get('/', (req, res) => {
    return res.status(200).json({
        status: true,
        message: "Job Event Route is Working"
    })
})

const JOB_SYSTEM_PROMPT = `Analyze job event. Response ONLY JSON: {"summary": "brief (15 words)", "reason": "why (20 words)", "action": "fix (20 words)", "severity": "low|medium|high|critical", "isAnomaly": bool}
Rules: isRetryStorm=HIGH, zScore>3=HIGH, zScore>5=CRITICAL, status=failed+maxAttempt=HIGH, time>30s=CRITICAL, failed+anomaly=CRITICAL`


router.post('/', async (req, res) => {
    const rawData: RawData = req.body
    if (!rawData) {
        return res.status(401).json({
            status: false,
            message: "No RawData is Provided"
        })
    }

    // Push the processing time in Redis 
    const response = await JobEventLogic(rawData)
    const calculated = response ?? {
        isRetryStrom: false,
        isAnomaly: false,
        zScore: 0,
        avgAtTime: 0
    }

    // Insert into db
    try {
        if (response !== null) {
            addToBuffer({
                type: "job",
                data: {
                    queueName: rawData.queueName,
                    jobId: rawData.jobId,
                    processingMs: rawData.processingMs,
                    attemptMade: rawData.attemptMade,
                    maxAttempt: rawData.maxAttempt,
                    status: rawData.status,
                    errorMessage: rawData.errorMessage,
                    calculated: {
                        isRetryStrom: response.isRetryStrom,
                        isAnomaly: response.isAnomaly,
                        zScore: response.zScore,
                        avgAtTime: response.avgAtTime
                    }
                }
            })
        } else {
            addToBuffer({
                type: "job",
                data: {
                    queueName: rawData.queueName,
                    jobId: rawData.jobId,
                    processingMs: rawData.processingMs,
                    attemptMade: rawData.attemptMade,
                    maxAttempt: rawData.maxAttempt,
                    status: rawData.status,
                    errorMessage: rawData.errorMessage + ' Error To Fetch Calculated Data',
                    calculated: {
                        isRetryStrom: false,
                        isAnomaly: false,
                        zScore: 0,
                        avgAtTime: 0
                    }
                }
            })
        }

        io.emit('jobSnapshot', {
            queueName: rawData.queueName,
            jobId: rawData.jobId,
            processingMs: rawData.processingMs,
            status: rawData.status,
            calculated: response ?? {
                isRetryStrom: false, isAnomaly: false, zScore: 0, avgAtTime: 0
            }
        })

        if (calculated.isAnomaly || calculated.isRetryStrom || rawData.status === 'failed') {
            const message = `Queue:${rawData.queueName} Job:${rawData.jobId} Status:${rawData.status} Time:${rawData.processingMs}ms Attempts:${rawData.attemptMade}/${rawData.maxAttempt} ZScore:${calculated.zScore} Anomaly:${calculated.isAnomaly} RetryStorm:${calculated.isRetryStrom}`
            try {
                const { response: aiResponse } = await generateChat(message, JOB_SYSTEM_PROMPT)
                const cleaned = aiResponse.trim().replace(/```json|```/g, '').trim()
                const aiExplanation = JSON.parse(cleaned)
                console.log('Job AI:', aiExplanation)
                io.emit('groqJobAnalyse', aiExplanation)
            } catch (error: any) {
                console.log('Job AI parse error:', error?.message)
                io.emit('groqJobAnalyse', {
                    summary: `Job ${rawData.jobId} mein ${rawData.status} detected.`,
                    reason: 'AI response parse nahi hua, manual check karo.',
                    action: 'Job logs aur queue health check karo.',
                    severity: calculated.isRetryStrom ? 'critical' : 'high',
                    isAnomaly: true
                })
            }
        }

        return res.status(200).json({
            status: true,
            message: "Data Stored in Database"
        })
    }
    catch (error: any) {
        console.log(`Error While Inserting JobEvent Data in Database ${error?.message}`)
        return res.status(501).json({
            statsu: false,
            message: `Job Event Data is Not Able To Insert Due To ${error?.message}`
        })
    }
})

router.get('/result', async (req, res) => {
    let { cursorId } = req.query
    try {
        let query: any = {}

        if (cursorId && cursorId !== 'null') {
            query.capturedAt = { $lt: new Date(cursorId as string) }
        }

        const jobResult = await JobEvent
            .find(query)
            .sort({ capturedAt: -1 })
            .limit(5)

        const newCursorId = jobResult.length > 0 ? jobResult[jobResult.length - 1]!.capturedAt : null

        return res.status(200).json({
            status: true,
            data: jobResult,
            nextCursor: newCursorId,
        })
    }
    catch (error: any) {
        console.log('Error fetching job event results:', error.message)
        return res.status(200).json({
            status: false,
            data: [],
            nextCursor: null
        })
    }
})

export default router