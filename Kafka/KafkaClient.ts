import { Kafka , RetryOptions } from "kafkajs"
import fs from 'fs'
import path from 'path'

const retryOption:RetryOptions = {
    retries:8,
    initialRetryTime:300,
    factor:2,
    multiplier:2,
    maxRetryTime:30000
}

const kafkaClient = new Kafka({
    brokers:["backend-kafka-backenddev.d.aivencloud.com:12576"],
    clientId:"TraceMind",
    ssl:{
        ca:[fs.readFileSync(path.join(__dirname , '..' , 'ca.pem') , {encoding:'utf-8'})],
        cert:fs.readFileSync(path.join(__dirname , '..' , 'cert.cert') , {encoding:'utf-8'}),
        key:fs.readFileSync(path.join(__dirname , '..' , 'key.key') , {encoding:"utf-8"}),
        rejectUnauthorized:false,
    },
    retry:retryOption,
    connectionTimeout:10000,
    requestTimeout:30000,
    logLevel: 2  // ERROR level only
})

export default kafkaClient
