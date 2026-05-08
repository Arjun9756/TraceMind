import redis from '../Utility/Redis.config'

interface RawData{
    queueName:string,
    jobId:number,
    processingMs:number,
    attemptMade:number,
    maxAttempt:number,
    status:'completed' | 'failed',
    errorMessage:string
}

interface JobResponse{
    isRetryStrom:boolean,
    isAnomaly:boolean,
    zScore:number,
    avgAtTime:number
}

interface ProcessingStats{
    avgAtTime:number,
    avgProcessingMs:number,
    list:[] | string[]
}
/**
 * 
 * @param queueName
 * @param processingMs
 * @returns {none} 
 */
async function pushProcessingMs(queueName:string , processingMs:number){
    const key = `${queueName}:processing`
    try{
        // 1.Check Length of List
        const listLength = await redis.llen(key)
        if(listLength >= 5){
            await redis.lpop(key)
        }

        await redis.rpush(key , processingMs.toString())
        return
    }
    catch(error:any){
        console.log(`Error While Inserting Processing Ms For Job Event in Redis ${error?.message}`)
        return
    }
}

/**
 * @param queueName 
 * @returns {avgAtTime , avgProcessingMs , list of processingMs}
 */
async function getProcessing(queueName:string):Promise<ProcessingStats>{
    const key = `${queueName}:processing`
    try{
        const list = await redis.lrange(key , 0 , -1)
        let totalSum = 0

        for(let item of list){
            totalSum += parseInt(item ?? "0")
        }

        return {
            avgAtTime:(list.length > 0 ? totalSum / list.length : 0),
            avgProcessingMs:(list.length < 5 ? 0 : (list.length > 0 ? totalSum / list.length : 0)),
            list
        }
    }
    catch(error:any){
        console.log(`Error While Fetching From Redis For Job Event ${error?.message}`)
        return {
            avgAtTime:0,
            avgProcessingMs:0,
            list:[]
        }
    }
}

/**
 * @param list - Array of historical processing times
 * @param mean - Average processing time
 * @param currProcessing - Current job's processing time
 * @returns {number} - Z-score indicating how many standard deviations away from mean
 * @description Calculates how abnormal the current processing time is compared to history
 * Z-score > 3 = highly abnormal (99.7% confidence)
 * Z-score > 2 = suspicious (95% confidence)
 */
function getZScore(list:string[] , mean:number , currProcessing:number):number{
    // Calculate variance (average of squared differences from mean)
    let variance = 0
    for(let item of list){
        variance += Math.pow((parseInt(item ?? "0") - mean) , 2)
    }

    variance = variance / list.length
    let stddev = Math.sqrt(variance)
    
    // If no variation in data, can't calculate z-score
    if(stddev === 0){
        return 0
    }
    
    // Z-score = (current value - mean) / standard deviation
    return (currProcessing - mean) / stddev
}

async function JobEventLogic(rawData:RawData):Promise<JobResponse | null>{
    try{
        const isRetryStrom = (rawData.attemptMade > (rawData.maxAttempt * 0.7) ? true : false)
        const {avgAtTime , avgProcessingMs , list} = await getProcessing(rawData.queueName)
        const zScore = (list.length >= 5 ? getZScore(list , avgProcessingMs , rawData.processingMs) : 0)
        const isAnomaly = Math.abs(zScore) > 3 || rawData.processingMs > 5000 // Z-score > 3 OR > 5 seconds
        
        // Save the latest z-score for Queue.logic.ts to retrieve
        const zScoreKey = `${rawData.queueName}:latestZScore`
        await redis.set(zScoreKey, zScore.toString(), 'EX', 300) // Expire after 5 minutes
        
        // Push the ACTUAL processing time (not average)
        await pushProcessingMs(rawData.queueName , rawData.processingMs)
        
        return {
            isRetryStrom,
            avgAtTime,
            zScore: parseFloat(zScore.toFixed(2)),
            isAnomaly
        }
    }
    catch(error:any){
        console.log(`Error in JobEvent Logic ${error?.message}`)
        return null
    }
}

export default JobEventLogic