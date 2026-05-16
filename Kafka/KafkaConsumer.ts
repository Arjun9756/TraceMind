import kafkaClient from "./KafkaClient"
import {JobEventHandler} from '../LogicHandlers/JobEvent.Handler'
import { QueueEventHandler } from "../LogicHandlers/QueueEvent.Handler"
import { SystemEventHandler } from "../LogicHandlers/SystemEvent.Handler"
import { RedisEventHandler } from "../LogicHandlers/RedisEvent.Handler"

async function processMessage(partition:number , message:any) {
    try{
        const key = message.key ? message.key.toString() : null
        const value = message.value ? message.value.toString() : null
        
        if(!key || !value) {
            console.log('Message missing key or value')
            return
        }
        
        console.log(`Processing: ${key} from partition ${partition}`)
        
        // Parse JSON value
        const data = JSON.parse(value)
        
        switch(key){
            case "JobEvent":
                await JobEventHandler(data)
                break
            case "QueueEvent":
                await QueueEventHandler(data)
                break
            case "RedisEvent":
                await RedisEventHandler(data)
                break
            case "SystemEvent":
                await SystemEventHandler(data)
                break
            default:
                console.log(`Unknown message type: ${key}`)
                break
        }
    }
    catch(error:any){
        console.log(`Error processing Kafka message: ${error?.message}`)
    }
}

const consumer = kafkaClient.consumer({
    groupId:"Trace-Mind-Consumer",
    sessionTimeout: 30000,
    heartbeatInterval: 3000
})

consumer.on('consumer.connect' , ()=>{
    console.log("Kafka Consumer Connected")
})

consumer.on('consumer.disconnect' , ()=>{
    console.log("Kafka Consumer Disconnected")
})

consumer.on('consumer.crash' , (event)=>{
    console.log(`Consumer Crashed: ${event.payload.error?.message}`)
    console.log(`Consumer will restart automatically`)
})

export async function startConsumer(){
    try{
        console.log('Connecting Kafka Consumer...')
        await consumer.connect()
        
        console.log('Subscribing to topic: TraceMindTaskEvents')
        await consumer.subscribe({
            topic: "TraceMindTaskEvents",
            fromBeginning: false  // Only new messages
        })
        
        console.log('Starting to consume messages...')
        await consumer.run({
            eachMessage: async ({topic, partition, message}) => {
                await processMessage(partition, message)
            }
        })
        
        console.log('Kafka Consumer is running!')
    }
    catch(error:any){
        console.log(`Kafka Consumer Error: ${error?.message}`)
        console.log('Consumer will not process messages')
    }
}

startConsumer()