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

const JOB_SYSTEM_PROMPT = `
You are a backend infrastructure monitoring AI specializing in BullMQ job analysis.
You will receive real-time job event data including processing time, retry attempts, and anomaly scores.
Your job is to analyze it and respond ONLY in this exact JSON format — no extra text, no markdown, no explanation outside JSON:

{
  "summary": "one line — what is happening",
  "reason": "why this might be happening",
  "action": "what should be done immediately",
  "severity": "low | medium | high | critical",
  "isAnomaly": true or false
}

Job-specific Analysis Rules:
- isRetryStorm = true: HIGH — job failing repeatedly, downstream service may be down
- zScore > 3: HIGH — processing time is abnormally slow compared to history
- zScore > 5: CRITICAL — severe processing anomaly, worker may be stuck
- status = failed AND attemptMade >= maxAttempt: HIGH — job exhausted all retries
- processingMs > 10000 (10s): WARNING — job taking too long
- processingMs > 30000 (30s): CRITICAL — job likely stuck or timed out
- isAnomaly = true AND isRetryStorm = true: CRITICAL — both anomaly and retry storm

Severity Guide:
- low    = job completed normally, zScore < 2
- medium = zScore 2-3 or single retry
- high   = retry storm or zScore > 3 or job failed
- critical = exhausted retries + high zScore or processingMs > 30s

Word Limits:
- summary: under 15 words
- reason: under 20 words
- action: under 20 words

Response Language: English
Output: Pure JSON only, no markdown, no extra fields
`


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
            const message = `
JOB EVENT ALERT

Queue     : ${rawData.queueName}
Job ID    : ${rawData.jobId}
Status    : ${rawData.status.toUpperCase()}

RAW DATA:
- Processing Time : ${rawData.processingMs}ms
- Attempts Made   : ${rawData.attemptMade}
- Max Attempts    : ${rawData.maxAttempt}
- Error           : ${rawData.errorMessage ?? 'None'}

CALCULATED:
- Z-Score         : ${calculated.zScore}
- Avg At Time     : ${calculated.avgAtTime}ms
- Is Retry Storm  : ${calculated.isRetryStrom ? 'YES' : 'NO'}
- Is Anomaly      : ${calculated.isAnomaly ? 'YES' : 'NO'}

Analyze this job event and provide actionable insights.
`
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
            hasMore: jobResult.length === 5
        })
    }
    catch (error: any) {
        console.log('Error fetching job event results:', error.message)
        return res.status(200).json({
            status: false,
            data: [],
            nextCursor: null,
            hasMore: false
        })
    }
})

export default router