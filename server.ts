import express from 'express'
import path from 'path'
import dotenv from 'dotenv'
import http from 'http'
import os from 'os'
import connectToMongo from './Database/Mongo.db'
import queueRoute from './Routes/Queue.route'
import jobRoute from './Routes/JobEvent.route'
import systemRoute from './Routes/System.route'
import redisRoute from './Routes/Redis.route'
import {server} from './Websocket/Websocket'
import cors from 'cors'

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

// Serve static frontend files
// app.use(express.static(path.join(__dirname, 'public')))

app.use('/api/queue' , queueRoute)
app.use('/api/job' , jobRoute)
app.use('/api/system' , systemRoute)
app.use('/api/redis' , redisRoute)

app.listen(process.env.PORT || 3000 , async ()=>{
    await connectToMongo()
    console.log(`Server is Running on Port ${process.env.SERVER_PORT || 3000}`)
})

server.listen(process.env.WEBSOCKET_SERVER || 5500 , ()=>{
    console.log("Websocket Server is Running")
})