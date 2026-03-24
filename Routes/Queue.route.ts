import express , {Request , Response} from 'express'
import {QueueSnapshot} from '../Models/QueueSnapshot.model'
import calculateQueue from '../BusinessLogic/CalculateQueue'

const router = express.Router()
router.get("/" , (req:Request , res:Response)=>{
    return res.status(202).json({
        status:true,
        message:"Queue Get Request"
    })
})

router.post("/" , async (req:Request , res:Response)=>{
    try{
        const rawData = req.body
        const queueResponse = await calculateQueue(rawData)

        // Bull MQ Auto Retry in Future
        if(!queueResponse){
            return res.status(501).json({
                status:false,
                message:"Internal Server Error in Trace Mind"
            })
        }

        const {status , calculated , alertMessage} = queueResponse

        const snapshot = await QueueSnapshot.create({
            queueName:rawData.queueName,
            raw:{
                waiting:rawData.waiting,
                active:rawData.active,
                completed:rawData.completed,
                failed:rawData.failed,
                stalledCount:rawData.stalledCount,
                councurrency:rawData.concurrency,
            },
            calculated,
            status,
            alertMessage
        })
        await snapshot.save()

        return res.status(200).json({
            status:true,
            message:"Snapsot Noted"
        })
    }
    catch(error:any){
        console.log("Queue Snapshot Error")
        return res.status(501).json({
            status:false,
            message:"Trace Mind Server is Down"
        })
    }
})

export default router