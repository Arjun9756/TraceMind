import {QueueSnapshot} from '../Models/QueueSnapshot.model'
import {RedisSnapshot} from '../Models/RedisEvent.model'
import {JobEvent} from '../Models/JobEventSchema.model'
import {SystemSnapshot} from '../Models/SystemSnapshot.model'

interface BulkBuffer {
    type: 'queue' | 'redis' | 'system' | 'job',
    data: any
}

const buffer: BulkBuffer[] = []
const BATCH_SIZE = 2 // Reduced from 5 to 2 for faster processing

export async function addToBuffer(item: BulkBuffer) {
    buffer.push(item)
    console.log(`📦 Buffer updated: ${buffer.length}/${BATCH_SIZE} items`)
    if (buffer.length >= BATCH_SIZE) {
        await flushBuffer()
    }
}

async function flushBuffer() {
    try {
        if (buffer.length === 0)
            return

        const batch = buffer.splice(0, buffer.length)
        console.log(`⚡ Flushing ${batch.length} buffered items...`)
        
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

        const results = await Promise.all([
            queueDocs.length > 0 ? QueueSnapshot.insertMany(queueDocs).catch(e => ({ error: e.message })) : null,
            redisDocs.length > 0 ? RedisSnapshot.insertMany(redisDocs).catch(e => ({ error: e.message })) : null,
            systemDocs.length > 0 ? SystemSnapshot.insertMany(systemDocs).catch(e => ({ error: e.message })) : null,
            jobDocs.length > 0 ? JobEvent.insertMany(jobDocs).catch(e => ({ error: e.message })) : null,
        ])

        console.log(`✅ Bulk inserted ${batch.length} documents | Queue: ${queueDocs.length}, Redis: ${redisDocs.length}, System: ${systemDocs.length}, Jobs: ${jobDocs.length}`)
    }
    catch (error: any) {
        console.log(`❌ Error in Insertion ${error?.message}`)
    }
}

const timeout = setInterval(async()=>{
    // console.log(`Batch Processing in Background`) // Quiet unless needed
    if(buffer.length > 0){
        console.log(`🔄 Background flush triggered (${buffer.length} items pending)`)
        await flushBuffer()
    }
},5000) // 5 seconds (reduced from 10)

process.on('SIGINT' , (sign)=>{
    clearInterval(timeout)
    console.log("Safe Cleanup Service Executed")
})