import {Server , Socket} from 'socket.io'
import http from 'http'
import path from 'path'
import express from 'express'

const app = express()
const server = http.createServer(app)
const io = new Server(server , {
    cors:{
        origin:process.env.FRONTEND_URL || "*",
        allowedHeaders:["Authorization" , "IsSyncNeeded"],
        methods:["GET" , "POST" , "PUT" , "PATCH" , "DELETE" , "OPTIONS"],
        preflightContinue:true
    },
    pingInterval:21000, // 21 second baad ping
    pingTimeout:21000 // 20 second bad connection close kro
})

io.on("connection" , (socket)=>{
    console.log(`Connection Stablished ${socket.id}`)
})

export function getIO():Server{
    if(io){
        return io
    }
    throw new Error("No Socket is Avalilable in System")
}

export {server}