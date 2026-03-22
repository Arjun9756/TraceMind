import express from 'express'
import path from 'path'
import dotenv from 'dotenv'
import http from 'http'
import {Server} from 'socket-io'
import os from 'os'
import connectToMongo from './Database/Mongo.db'

const app = express()
const server = http.createServer(app)
const webSocket = new Server(server)

dotenv.config({
    path:path.join(__dirname , ".env")
})

app.use(express.urlencoded({extended:true}))
app.use(express.json())

app.listent(process.env.PORT || 3000 , async ()=>{
    await connectToMongo()
    console.log(`Server is Running on Port ${process.env.SERVER_PORT || 3000}`)
})