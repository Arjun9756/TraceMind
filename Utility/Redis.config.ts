import dotenv from 'dotenv'
import {Redis} from 'ioredis'
import path from 'path'

dotenv.config({
    path:path.join(__dirname , ".." , ".env")
})

const redis = new Redis({
    username:process.env.REDIS_USERNAME as string,
    password:process.env.REDIS_PASSWORD as string,
    port:parseInt(process.env.REDIS_PORT || "6379") as number,
    host:process.env.REDIS_HOST,
    retryStrategy:(times)=>{
        if(times > 25){
            throw new Error("Max Retry Reached Server Down")
        }
        return Math.min(3000 , times * 100)
    },
    tls:{
        rejectUnauthorized:false,
    },
    connectTimeout:10000,
    commandTimeout:12000
})

export default redis