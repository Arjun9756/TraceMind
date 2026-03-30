import { Kafka , RetryOptions } from "kafkajs"
import fs from 'fs'
import path from 'path'

const retryOption:RetryOptions = {
    retries:5,
    initialRetryTime:100,
    factor:2
}

const kafkaClient = new Kafka({
    brokers:["backend-kafka-backenddev.d.aivencloud.com:12576"],
    clientId:"TraceMind",
    ssl:{
        port:12576,
        ca:fs.readFileSync(path.join(__dirname , '..' , 'ca.pem') , {encoding:'utf-8'}),
        cert:fs.readFileSync(path.join(__dirname , '..' , 'cert.pem') , {encoding:'utf-8'}),
        key:fs.readFileSync(path.join(__dirname , '..' , 'key.pem') , {encoding:"utf-8"}),
        host:process.env.AIVEN_KAFKA_HOST as string,
        rejectUnauthorized:false,
    },
    retry:retryOption,
    connectionTimeout:5000,
    requestTimeout:5000,
})

export default kafkaClient