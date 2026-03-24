import express from 'express'
import redis from '../Utility/Redis.config'
import {SystemSnapshot} from '../Models/SystemSnapshot.model'

const router = express.Router()
interface SystemRawData{
    cpuPercent:number,
    memTotalMB:number,
    memFreeMB:number,
    loadAvg1m:number,
    loadAvg5m:number,
    loadAvg15m:number
    coreCount:number,
    processHeapMB:number,
    platform:string,
    uptime:number,
    processUptime:number,
    calculated:{
        memUsedMB:number,
        memUsedPercent:number,
        isHighCpu:boolean,
        isHighMemory:boolean
    },
    status:'health' | 'warning' | 'critical',
    alertMessage:string,
}

router.get('/' , (req,res)=>{
    return res.status(200).json({
        status:true,
        message:"System Route is Working"
    })
})

router.post('/' , async (req,res)=>{
    const rawData:SystemRawData = req.body
    try{

        const {calculated , status , alertMessage} = getSystemResult(rawData)

        const systemData = await SystemSnapshot.insertOne({
            cpuPercent:Number(rawData.cpuPercent),
            memTotalMB:Number(rawData.memTotalMB),
            memFreeMB:Number(rawData.memFreeMB),
            loadAvg1M:Number(rawData.loadAvg1m),
            loadAvg5M:Number(rawData.loadAvg5m),
            loadAvg15M:Number(rawData.loadAvg15m),
            processHeapMB:Number(rawData.processHeapMB),
            coreCount:Number(rawData.coreCount),
            platform:Number(rawData.platform),
            uptime:Number(rawData.uptime),
            processUptime:Number(rawData.processUptime),
            calculated:{

            }
        })
    }
    catch(error:any){
        console.log(`Error While Saving System Data`)
    }
})