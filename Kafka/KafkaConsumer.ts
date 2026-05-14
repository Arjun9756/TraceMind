import kafkaClient from "./KafkaClient"
import {JobEventHandler} from '../LogicHandlers/JobEvent.Handler'
import { QueueEventHandler } from "../LogicHandlers/QueueEvent.Handler"
import { SystemEventHandler } from "../LogicHandlers/SystemEvent.Handler"
import { RedisEventHandler } from "../LogicHandlers/RedisEvent.Handler"
import os from 'os'

async function processMessage(partition:number , message:any) {
    try{
        const key = message.key ? message.key.toString() : null
        if(!key)
            return
        
        switch(key){
            case "JobEvent":
                JobEventHandler(message)
                break
            case "QueueEvent":
                QueueEventHandler(message)
                break
            case "RedisEvent":
                RedisEventHandler(message)
                break
            case "SystemEvent":
                SystemEventHandler(message)
                break
            default:
                break
        }
    }
    catch(error:any){
        console.log(`Error While Processing Kafka Tasks ${error?.message}`)
    }
}

const consumer = kafkaClient.consumer({
    groupId:"Trace-Mind-Consumer"
})

consumer.on('consumer.connect' , (event)=>{
    console.log("Kafka Consumer Connected To TraceMind")
})

consumer.on('consumer.disconnect' , (event)=>{
    console.log("Kafka Consumer Disconnected To TraceMind")
})

consumer.on('consumer.crash' , (event)=>{
    console.log(`Consumer Crashed ${event.payload}`)
    console.log(`Consumer Will Be Restarted Auto`)
})

async function startAndSubscribe(){
    try{
        await consumer.subscribe({
            fromBeginning:true,
            topic:"TraceMindTaskEvents"
        })

        console.log("Consumer Subscribe The Topic")
    }
    catch(error:any){
        console.log(`Error While Connecting To Kafka Consumer ${error?.message || "Aiven Kafka Cloud Error"}`)
    }
}

async function consumeTopics(){
    try{
        await consumer.run({
            eachMessage:async function({partition ,message}){
                await processMessage(partition , message)
            }
        })
    }
    catch(error:any){

    }
}


startAndSubscribe().then(()=>{

}).catch((error:any)=>{

})

consumeTopics().then(()=>{}).catch((error:any)=>{})
process.on('SIGINT' , async (signal)=>{
    console.log("Process Terminated Kafka Consumer ShutDown")
    await consumer.disconnect()
})