import express from 'express'
import path from 'path'
import dotenv from 'dotenv'
import connectToMongo from './Database/Mongo.db'
import {router as queueRoute} from './Routes/Queue.route'
import {router as jobRoute} from './Routes/JobEvent.route'
import {router as systemRoute} from './Routes/System.route'
import {router as redisRoute} from './Routes/Redis.route'
import {server} from './Websocket/Websocket'
import cors from 'cors'
import mongoose from 'mongoose'
import redis from './Utility/Redis.config'
import {connectProducer, disconnectProducer} from './Kafka/KafkaProducer'
import {startConsumer} from './Kafka/KafkaConsumer'

const app = express()
app.use(cors({
    origin:"*",
    allowedHeaders:["Authorization" , 'IsSycnNeed'],
    methods:["GET" , "POST" , "PUT" , "PATCH" , "DELETE" , "OPTIONS"],
    preflightContinue:true,
    optionsSuccessStatus:200
}))

dotenv.config({
    path:path.join(__dirname , ".env")
})

app.use(express.urlencoded({extended:true}))
app.use(express.json())
app.set('trust proxy' , true)         // Forward Proxy Manage

// Serve landing page
app.use('/landing', express.static(path.join(__dirname, 'landing')))

// Serve dashboard (frontend)
app.use(express.static(path.join(__dirname, 'frontend')))

// Health Check Endpoint
app.get('/health', async (req, res) => {
    try {
        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            services: {
                mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
                redis: redis.status === 'ready' ? 'connected' : 'disconnected',
                server: 'running'
            },
            uptime: process.uptime(),
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
            }
        }
        res.status(200).json(health)
    } catch (error: any) {
        res.status(503).json({
            status: 'error',
            message: error?.message
        })
    }
})

// Landing page route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'landing', 'index.html'))
})

// Dashboard route
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'))
})

app.use('/api/queue' , queueRoute)
app.use('/api/job' , jobRoute)
app.use('/api/system' , systemRoute)
app.use('/api/redis' , redisRoute)

app.listen(process.env.PORT || 3000 , async ()=>{
    await connectToMongo()
    await startConsumer()
    await connectProducer()
    console.log(`Server is Running on Port ${process.env.SERVER_PORT || 3000}`)
})

server.listen(process.env.WEBSOCKET_SERVER || 5500 , ()=>{
    console.log("Websocket Server is Running")
})

// Graceful Shutdown Handler
async function gracefulShutdown(signal: string) {
    console.log(`\n${signal} received. Starting graceful shutdown...`)
    
    try {
        // Close WebSocket server
        server.close(() => {
            console.log('WebSocket server closed')
        })
        
        // Disconnect Kafka Producer
        await disconnectProducer()
        
        // Close MongoDB connection
        await mongoose.connection.close()
        console.log('MongoDB connection closed')
        
        // Close Redis connection
        await redis.quit()
        console.log('Redis connection closed')
        
        console.log('Graceful shutdown completed')
        process.exit(0)
    } catch (error: any) {
        console.error('Error during shutdown:', error?.message)
        process.exit(1)
    }
}

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))