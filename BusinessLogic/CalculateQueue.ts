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
    try{    
        await redis.set(queueName , JSON.stringify(rawData))
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
    try{
        const data = await redis.get(queueName)
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
    try{
        const list = await redis.lrange(queueName , 0 , -1)
        if(list.length < 5)
            return 0

        // Finding Standard Deviation To Check 
        //1. Find the diff from meand power it two and summ it up

        let meanDiffSum = 0
        for(let item of list){
            meanDiffSum += Math.pow((avgProcessingMs - parseInt(item)) , 2)
        }

        let stddev = Math.sqrt(meanDiffSum)
        if(stddev){
            return 0
        } 

        return (parseInt(list[list.length-1]) / avgProcessingMs) / stddev
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
    try{
        let totalSum = 0
        const list = await redis.lrange(queueName , 0 , -1)
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
function getStatus(status:QueueResponse['status'] , alertMessage:QueueResponse['alertMessage'] , growthRate:number , failureRate:number , isGhostFailure:boolean , waiting:number){
    if(isGhostFailure){
        status = "ghostFailure"
        alertMessage = `Workers Dead ${waiting} Jobs Are Waiting`
    }
    else if(failureRate > 10 || growthRate > 20){
        status = "critical"
        alertMessage = (failureRate > 10 ? `Failure Rate is Going High ${failureRate}` : `Growth Rate is Going High ${growthRate}`)
    }
    else{
        status = "healthy"
        alertMessage = "Internal System is Healthy"
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
            await redis.set(rawData.queueName , JSON.stringify(rawData))
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

        const growthRate = rawData.waiting - prevData.waiting        // currWaiting - prevWaiting
        const totalJobs = rawData.completed + rawData.failed         // completed + failed = total jobs

        const failedRate =  totalJobs > 0 ? rawData.failed / totalJobs * 100 : 0
        const isGhostFailure = (rawData.active == 0 && rawData.waiting > 0 ? true : false)

        let status:QueueResponse['status'] = 'healthy'
        let alertMessage:QueueResponse['alertMessage'] = "No Issue Detected"

        // get status filled
        getStatus(status , alertMessage , growthRate , failedRate , isGhostFailure , rawData.waiting)
        let avgProcessingMs = await getAvgProcessing(rawData.queueName)

        if(avgProcessingMs === null){
            avgProcessingMs = 0;
        }
        const zScore = await getZScore(rawData.queueName , avgProcessingMs)

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