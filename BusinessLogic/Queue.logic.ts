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
 * @param avgProcessingMs number
 * @returns {number}
 */
async function getZScore(queueName:string , avgProcessingMs:number):Promise<number>{
    const processingKey = `${queueName}:processing`
    try{
        const list = await redis.lrange(processingKey , 0 , -1)
        if(list.length < 5)
            return 0

        // Finding Standard Deviation To Check 
        //1. Find the diff from meand power it two and summ it up

        let meanDiffSum = 0
        for(let item of list){
            meanDiffSum += Math.pow((avgProcessingMs - parseInt(item ?? "0")) , 2)
        }

        meanDiffSum = meanDiffSum / list.length
        let stddev = Math.sqrt(meanDiffSum)
        
        if(!stddev || stddev === 0 || stddev == null || stddev === undefined){
            return 0
        } 

        return parseFloat(((parseInt(list[0]!) - avgProcessingMs) / stddev).toFixed(2)) // ! tells compiler i promise that index is not empty
    }
    catch(error:any){
        console.log(`Error While Getting ZScore ${error?.message}`)
        return 0
    }
}

/**
 * 
 * @param queueName {string}
 * @description {Calculate the mean of last five transaction}
 * @returns {null | avgProcessingMs}
 */
async function getAvgProcessing(queueName:string):Promise<number | null>{
    const processingKey = `${queueName}:processing`
    try{
        let totalSum = 0
        const list = await redis.lrange(processingKey , 0 , -1)
        console.log(`List For Queue ${list}`)

        if(list.length < 5){
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
            alertMessage:`Workers Dead ${waiting} Jobs Are Waiting`
        }
    }
    else if(failureRate > 10 || growthRate > 20){
        return {
            status:"critical",
            alertMessage:(failureRate > 10 ? `Failure Rate is Going High ${failureRate}` : `Growth Rate is Going High ${growthRate}`)
        }
    }
    else if (failureRate > 2 || growthRate > 5 || zScore > 2) {
        return { status: "warning", alertMessage: `Warning: failureRate=${failureRate}% growthRate=${growthRate}` }
    }
    return {
        status: "healthy",
        alertMessage: "Internal System is Healthy"
    }
    
}

/**
 * 
 * @param {queueName , waiting , active , completed , stalledCount , councurrency}
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
                alertMessage:"No Prev Data Baseline Created"
            }
        }

        const growthRate = prevData.waiting > 0 ? ((rawData.waiting - prevData.waiting) / prevData.waiting) * 100 : 0        // currWaiting - prevWaiting
        const totalJobs = rawData.completed + rawData.failed         // completed + failed = total jobs

        const failedRate =  totalJobs > 0 ? rawData.failed / totalJobs * 100 : 0
        const isGhostFailure = (rawData.active == 0 && rawData.waiting > 0 && rawData.completed === prevData.completed ? true : false)

        let avgProcessingMs = await getAvgProcessing(rawData.queueName)
         if(avgProcessingMs === null){
            avgProcessingMs = 0;
        }
        
        const zScore = await getZScore(rawData.queueName , avgProcessingMs)
        // get status filled
        let {status , alertMessage} = getStatus(growthRate , failedRate , isGhostFailure , zScore , rawData.waiting)

        // saved to redis
        await saveToRedis(rawData.queueName , rawData)
        let queueResponse:QueueResponse = {
            alertMessage:alertMessage,
            status:status,
            calculated:{
                growthRate:growthRate,
                failureRate:failedRate,
                avgProcessingMs:avgProcessingMs,
                zScore:zScore,
                isGhostFailure:isGhostFailure
            }
        }

        return queueResponse
    }
    catch(error:any){
        console.log("Error ins Calculate Redis Queue" , + error?.message)
        return null
    }
}

export default calculateQueue