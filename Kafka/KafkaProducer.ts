import { CompressionTypes } from "kafkajs"
import kafkaClient from "./KafkaClient"
const producer = kafkaClient.producer()

producer.on("producer.connect" , (event)=>{
    console.log("Kafka Producer Started Id" + event.id)
})

producer.on("producer.disconnect" , (event)=>{
    console.log("Kafka Producer Disconnect" + event.id)
})

export async function connectProducer(){
    try{
        await producer.connect()
    }
    catch(error:any){
        console.log(`Error in Producer ${error?.message}`)
        process.exit(1) // No Kafka No Service
    }
}

export async function produceItem(topic:string , value:string , key:string , partition:number = 0){
    try{
        await producer.send({
            topic:topic,
            messages:[{key:key , value , partition}],
            compression:CompressionTypes.Snappy
        })
    }
    catch(error:any){
        console.log(`Error While Item Producer ${error?.message}`)
    }
}