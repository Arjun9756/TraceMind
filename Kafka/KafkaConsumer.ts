import kafkaClient from "./KafkaClient"
interface KafkaMessage{

}

async function processMessage(partition:number , message:KafkaMessage) {
    try{

    }
    catch(error:any){

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
            topic:"traceMindEvent"
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
            eachMessage:async function({partition , message}){
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