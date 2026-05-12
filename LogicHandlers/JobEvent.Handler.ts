import { RawData } from '../Routes/JobEvent.route'
import { addToBuffer } from '../Utility/BulkBuffer'
import JobEventLogic from '../BusinessLogic/JobEvent.logic'
import { getIO } from '../Websocket/Websocket'
import generateChat from '../Utility/Groq.AI'
const io = getIO()
import { JOB_SYSTEM_PROMPT } from '../Promtps/GroqPrompts'

export async function JobEventHandler(rawData: RawData) {

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

    }
    catch (error: any) {
        console.log(`Error While Inserting JobEvent Data in Database ${error?.message}`)
    }
}