import express from 'express'
import redis from '../Utility/Redis.config'
import {RedisSnapshot , IRedisSnapshot} from '../Models/RedisEvent.model'
import getRedisResult from '../BusinessLogic/Redis.logic'
const router = express.Router()

router.get('/' , (req,res)=>{
    return res.status(200).json({
        status:true,
        message:"Redis Route is Working"
    })
})

router.post('/' , async(req,res)=>{
    const rawData:IRedisSnapshot['raw'] = req.body
    try{
        const {calculated , alertMessage , status} = getRedisResult(rawData)
        const insertion = await RedisSnapshot.insertOne({
            raw:{
                latencyMs:Number(rawData.latencyMs),
                memUsedMB:Number(rawData.memUsedMB),
                memMaxMB:Number(rawData.memMaxMB),
                connectedClients:Number(rawData.connectedClients),
                commandPerSec:Number(rawData.commandPerSec),
                evictedKeys:Number(rawData.evictedKeys),
                keySpaceHits:Number(rawData.keySpaceHits),
                keySpaceMisses:Number(rawData.keySpaceMisses)
            },
            calculated,
            status,
            alertMessage
        })

        return res.status(200).json({
            status:true,
            message:"Redis Data Inserted"
        })
    }
    catch(error:any){
        console.log(`Error While Inserting Redis Data ${error?.message}`)
        return res.status(501).json({
            status:false,
            message:"Redis Insertion Error in Trace Mind"
        })
    }
})

export default router