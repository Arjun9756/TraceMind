import { QueueSnapshot } from "../Models/QueueSnapshot.model";
import redis from '../Utility/Redis.config'

interface RawDataQueue{
    queueName:string,
    waiting:number,
    active:number,
    completed:number,
    stalledCount:number,
    concurrency:number,
    failed:number
}

interface QueueResponse{
    calculated:{
        growthRate:number,
        failureRate:number,
        avgProcessingMs:number,
        zScore:number,
        isGhostFailure:boolean
    },
    status:"healthy" | "warning" | "critical" | "ghostFailure"
    alertMessage:string
}

async function saveToRedis(queueName:string , rawData:RawDataQueue){
    const statsKey = `${queueName}:stats`
    try{    
        await redis.set(statsKey , JSON.stringify(rawData))
        console.log(`Data Saved To Redis`)
    }
    catch(error:any){
        console.log("Error While Saving To Redis" + error?.message)
        return
    }
}

/**
 * 
 * @param {queueName}
 * @returns {queueName , waiting , active , completed , stalledCount , councurrency}
 */
async function getPrevQueueData(queueName:string):Promise<RawDataQueue | null>{
    const statsKey = `${queueName}:stats`
    try{
        const data = await redis.get(statsKey)
        if(!data)
            return null
        console.log("Data Fetched From Redis Prev Queue" , data)
        const parsed:RawDataQueue = JSON.parse(data)

        return parsed
    }
    catch(error){
        console.log("Error While Getting Previous Data of Queue")
        return null
    }
}
/**
 * 
 * @param queueName string
 * @returns {number} - Returns the latest z-score from job events
 * @description Z-score is now calculated in JobEvent.logic.ts when actual jobs complete
 * This function just retrieves the last calculated z-score for display purposes
 */
async function getLatestZScore(queueName:string):Promise<number>{
    const zScoreKey = `${queueName}:latestZScore`
    try{
        const zScore = await redis.get(zScoreKey)
        return zScore ? parseFloat(zScore) : 0
    }
    catch(error:any){
        console.log(`Error While Getting Latest ZScore ${error?.message}`)
        return 0
    }
}

/**
 * 
 * @param queueName {string}
 * @description {Calculate the mean of last 5 job processing times}
 * @returns {number | null} - Average processing time in milliseconds
 */
async function getAvgProcessing(queueName:string):Promise<number | null>{
    const processingKey = `${queueName}:processing`
    try{
        let totalSum = 0
        const list = await redis.lrange(processingKey , 0 , -1)
        console.log(`List For Queue ${list}`)

        if(list.length === 0){
            return 0
        }

        for(let items of list){
            totalSum += parseInt(items)
        }
        return parseFloat((totalSum / list.length).toFixed(3))
    }
    catch(error:any){
        return null
    }
}

/**
 * @param status 
 * @param alertMessage 
 * @param growthRate 
 * @param failureRate 
 * @param isGhostFailure 
 * @param waiting 
 * @returns {status , alertMessage}
 */
function getStatus(growthRate:number , failureRate:number , isGhostFailure:boolean , zScore:number , waiting:number):{status: QueueResponse['status'], alertMessage: string}{
    if(isGhostFailure){
        return {
            status:"ghostFailure",
            alertMessage:`Workers Dead - ${waiting} Jobs Are Stuck`
        }
    }
    else if(failureRate > 10 || growthRate > 20){
        return {
            status:"critical",
            alertMessage:(failureRate > 10 ? `Failure Rate Critical: ${failureRate.toFixed(2)}%` : `Queue Growing Fast: +${growthRate} jobs`)
        }
    }
    else if (failureRate > 2 || growthRate > 5 || Math.abs(zScore) > 2) {
        const alerts = []
        if(failureRate > 2) alerts.push(`Failure Rate: ${failureRate.toFixed(2)}%`)
        if(growthRate > 5) alerts.push(`Growth: +${growthRate} jobs`)
        if(Math.abs(zScore) > 2) alerts.push(`Anomaly Detected (Z=${zScore.toFixed(2)})`)
        return { status: "warning", alertMessage: `Warning: ${alerts.join(', ')}` }
    }
    return {
        status: "healthy",
        alertMessage: "Queue is Healthy"
    }
    
}

// NOTE: This function is no longer used in Queue snapshots
// Processing times are now recorded in JobEvent.logic.ts when actual jobs complete
// Keeping this for backward compatibility, but it should not be called from calculateQueue

/**
 * 
 * @param {queueName, waiting , active , completed , stalledCount , councurrency}
 * @returns {growthRate , failureRate , avgProcessingMs , zScore , isGhostFailure , statsu , alertMessage}
 * @description {Make Use of Redis For DB Load Decrease}
 */

async function calculateQueue(rawData:RawDataQueue):Promise<QueueResponse | null>{
    try{
        const prevData = await getPrevQueueData(rawData.queueName)
        if(!prevData || prevData == null){
            await saveToRedis(rawData.queueName , rawData)
            return {
                calculated:{
                    growthRate:0,
                    failureRate:0,
                    isGhostFailure:false,
                    zScore:0,
                    avgProcessingMs:0
                },
                status:"healthy",
                alertMessage:"Baseline Created - Collecting Data"
            }
        }

        // FIX #1: Growth Rate - Absolute difference, not percentage
        // Previous: ((45-40)/40)*100 = 12.5% ❌
        // Now: 45-40 = +5 jobs ✅
        const growthRate = rawData.waiting - prevData.waiting

        // FIX #4: Failure Rate - Calculate from DELTA (recent changes only)
        // This shows failure rate of NEW jobs since last snapshot
        const newCompleted = rawData.completed - prevData.completed
        const newFailed = rawData.failed - prevData.failed
        const recentTotal = newCompleted + newFailed
        
        const failedRate = recentTotal > 0 
            ? (newFailed / recentTotal) * 100 
            : 0  // If no new jobs, use 0 instead of cumulative rate

        // FIX #5: Ghost Failure - More robust detection
        // Check if workers are truly dead (not just temporarily slow)
        const isGhostFailure = (
            rawData.active === 0 &&           // No active workers
            rawData.waiting > 0 &&            // Jobs are waiting
            rawData.completed === prevData.completed &&  // Nothing completed
            rawData.stalledCount > 0          // Workers died mid-job
        ) || (
            rawData.active === 0 &&           // Alternative: No workers
            rawData.waiting > 10 &&           // Many jobs waiting (threshold)
            newCompleted === 0 &&             // No progress
            rawData.stalledCount === 0        // But no stalled jobs (workers never started)
        )

        // Get average processing time from actual job completions
        let avgProcessingMs = await getAvgProcessing(rawData.queueName)
        if(avgProcessingMs === null){
            avgProcessingMs = 0
        }
        
        // FIX #2 & #3: Z-score now comes from JobEvent.logic.ts
        // It's calculated when actual jobs complete, not from queue snapshots
        const zScore = await getLatestZScore(rawData.queueName)
        
        // Get status based on corrected metrics
        let {status , alertMessage} = getStatus(growthRate , failedRate , isGhostFailure , zScore , rawData.waiting)

        // Save current data as "previous" for next snapshot
        await saveToRedis(rawData.queueName , rawData)
        
        let queueResponse:QueueResponse = {
            alertMessage:alertMessage,
            status:status,
            calculated:{
                growthRate:growthRate,
                failureRate:parseFloat(failedRate.toFixed(2)),
                avgProcessingMs:avgProcessingMs,
                zScore:parseFloat(zScore.toFixed(2)),
                isGhostFailure:isGhostFailure
            }
        }

        return queueResponse
    }
    catch(error:any){
        console.log("Error in Calculate Queue Logic: " + error?.message)
        return null
    }
}

export default calculateQueue