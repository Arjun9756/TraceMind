import { CompressionTypes } from "kafkajs"
import kafkaClient from "./KafkaClient"
const producer = kafkaClient.producer()

producer.on("producer.connect" , (event)=>{
    console.log("Kafka Producer Connected - ID: " + event.id)
})

producer.on("producer.disconnect" , (event)=>{
    console.log("Kafka Producer Disconnected - ID: " + event.id)
})

export async function connectProducer(){
    try{
        await producer.connect()
        console.log("Kafka Producer is ready")
    }
    catch(error:any){
        console.log(`Error connecting Kafka Producer: ${error?.message}`)
        console.log("V2 endpoints will not work without Kafka")
    }
}

export async function disconnectProducer(){
    try{
        await producer.disconnect()
        console.log("Kafka Producer disconnected")
    }
    catch(error:any){
        console.log(`Error disconnecting Kafka Producer: ${error?.message}`)
    }
}

async function createTopic(topicName:string , replication:number=1 , partitions:number=1){
    try{
        const admin = kafkaClient.admin()
        await admin.connect()

        const listTopics = await admin.listTopics()
        if(listTopics.includes(topicName)){
            console.log("Topic is Already Created")
            return
        }

        await admin.createTopics({topics:[{topic:topicName , replicationFactor:replication , numPartitions:partitions}] , waitForLeaders:true})
        console.log("Topic Created")
    }
    catch(error:any){
        console.log("Error While Creating Topic With Kafka" + error?.message)
        process.exit(1)
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
        console.log(`Error producing message: ${error?.message}`)
        throw error
    }
}

createTopic("TraceMindTaskEvents").then(()=>{

}).catch(()=>{
    
})
export { producer }