import {QueueSnapshot} from '../Models/QueueSnapshot.model'
import {RedisSnapshot} from '../Models/RedisEvent.model'
import {JobEvent} from '../Models/JobEventSchema.model'
import {SystemSnapshot} from '../Models/SystemSnapshot.model'

interface BulkBuffer {
    type: 'queue' | 'redis' | 'system' | 'job',
    data: any
}

const buffer: BulkBuffer[] = []
const BATCH_SIZE = 5

export async function addToBuffer(item: BulkBuffer) {
    buffer.push(item)
    if (buffer.length >= BATCH_SIZE) {
        await flushBuffer()
    }
}

async function flushBuffer() {
    try {
        if (buffer.length === 0)
            return

        const batch = buffer.splice(0, buffer.length)
        const queueDocs = batch.filter((item) => {
            return item.type === 'queue'
        }).map((item)=>item.data)

        const redisDocs = batch.filter((item) => {
            return item.type === 'redis'
        }).map((item)=>item.data)

        const systemDocs = batch.filter((item) => {
            return item.type === 'system'
        }).map((item)=>item.data)

        const jobDocs = batch.filter((item) => {
            return item.type === 'job'
        }).map((item)=>item.data)

        await Promise.all([
            queueDocs.length > 0 ? QueueSnapshot.insertMany(queueDocs) : null,
            redisDocs.length > 0 ? RedisSnapshot.insertMany(redisDocs) : null,
            systemDocs.length > 0 ? SystemSnapshot.insertMany(systemDocs) : null,
            jobDocs.length > 0 ? JobEvent.insertMany(jobDocs) : null,
        ])

        console.log(`Bulk inserted ${batch.length} documents`)
    }
    catch (error: any) {
        console.log(`Error in Insertion ${error?.message}`)
    }
}

const timeout = setInterval(async()=>{
    console.log(`Batch Processing in Background`)
    if(buffer.length > 0){
        await flushBuffer()
    }
},10000) // 10 seconds

process.on('SIGINT' , (sign)=>{
    clearInterval(timeout)
    console.log("Safe Cleanup Service Executed")
})