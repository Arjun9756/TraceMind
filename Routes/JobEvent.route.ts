import express from 'express'
import path from 'path'
import { JobEvent } from '../Models/JobEventSchema.model'
import JobEventLogic from '../BusinessLogic/JobEvent.logic'
import {getIO} from '../Websocket/Websocket'
import generateChat from '../Utility/Groq.AI'
const io = getIO()

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

    // Insert into db
    try {
        if (response !== null) {
            const status = JobEvent.insertOne({
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
                    avgAtTime: response.zScore
                }
            })
        } else {
            const status = JobEvent.insertOne({
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
            })
        }

        return res.status(200).json({
            status:true,
            message:"Data Stored in Database"
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

export default router