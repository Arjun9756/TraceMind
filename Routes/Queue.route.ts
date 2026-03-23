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

router.post("/queue" , async (req:Request , res:Response)=>{
    try{
        const rawData = req.body
        const {calculated , status , alertMessage} = await calculateQueue(rawData)

        const snapshot = await QueueSnapshot.create({
            queueName:rawData.queueName,
            raw:{
                waiting:rawData.waiting,
                active:rawData.active,
                completed:rawData.completed,
                failed:rawData.failed,
                stalledCount:rawData.stalledCount,
                councurrency:rawData.concurrency,
                failed:rawData.failed
            },
            calculated,
            status,
            alertMessage
        })

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