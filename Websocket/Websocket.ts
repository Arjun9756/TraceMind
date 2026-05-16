import {Server , Socket} from 'socket.io'
import http from 'http'
import path from 'path'
import express from 'express'

const app = express()

app.use(express.static(path.join(__dirname, '../frontend')))

// Serve index.html for SPA a on all unknown routes
app.use((req, res) => {
    // If request is for a file with extension, let static middleware handle it
    if (req.path.includes('.')) {
        return res.status(404).send('Not found')
    }
    // For all other requests, serve index.html
    res.sendFile(path.join(__dirname, '../frontend/index.html'))
})

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