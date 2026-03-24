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

async function JobEventLogic(rawData:RawData){
}

export default JobEventLogic