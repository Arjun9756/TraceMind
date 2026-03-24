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
    try{
        // 1.Check Length of List
        const listLength = await redis.llen(queueName)
        if(listLength >= 5){
            await redis.lpop(queueName)
        }

        await redis.rpush(queueName)
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
    try{
        const list = await redis.lrange(queueName , 0 , -1)
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

function getZScore(list:string[] , mean:number , currProcessing:number):number{
    // 1. meanDiffSum calculate
    let variance = 0
    for(let item of list){
        variance += Math.pow((mean - parseInt(item ?? "0")) , 2)
    }

    let stddev = Math.sqrt(variance)
    if(stddev === 0){
        return 0
    }
    return (parseInt(list[list.length-1]!) - currProcessing) / stddev
}

async function JobEventLogic(rawData:RawData):Promise<JobResponse | null>{
    try{
        const isRetryStrom = (rawData.attemptMade > rawData.maxAttempt * 0.7 ? true : false)
        const {avgAtTime , avgProcessingMs , list} = await getProcessing(rawData.queueName)
        const zScore = (list.length >= 5 ? getZScore(list , avgProcessingMs , rawData.processingMs) : 0)
        const isAnomaly = rawData.processingMs > 5000 // 5 second se jyda liya time

        return {
            isRetryStrom,
            avgAtTime,
            zScore,
            isAnomaly
        }
    }
    catch(error:any){
        console.log(`Error in JobEvent Logic ${error?.message}`)
        return null
    }
}

export default JobEventLogic