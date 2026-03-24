import express from 'express'
import path from 'path'
import dotenv from 'dotenv'
import http from 'http'
import os from 'os'
import connectToMongo from './Database/Mongo.db'
import queueRoute from './Routes/Queue.route'
import io from './Websocket/Websocket'
import jobRoute from './Routes/JobEvent.route'

const app = express()
dotenv.config({
    path:path.join(__dirname , ".env")
})

app.use(express.urlencoded({extended:true}))
app.use(express.json())
app.set('trust proxy' , true)         // Forward Proxy Manage

app.options('*' , (req , res)=>{
    return res.status(200).json({
        status:true,
        message:"Access Control Allowed Origin",
    })
})

app.use('/api/queue' , queueRoute)
app.use('/api/job' , jobRoute)


app.listen(process.env.PORT || 3000 , async ()=>{
    await connectToMongo()
    console.log(`Server is Running on Port ${process.env.SERVER_PORT || 3000}`)
})