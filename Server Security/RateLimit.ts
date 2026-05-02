import redis from '../Utility/Redis.config'
import dotenv from 'dotenv'
import path from 'path'
import {Request, Response, NextFunction} from 'express'

dotenv.config({
    path:path.join(__dirname , ".." , ".env")
})

const TTL = Number(process.env.REDIS_TTL) as number || 60 
const thresholdValue = Number(process.env.RATE_LIMIT_THRESHOLD) as number || 120

async function rateLimitUser(req:Request , res:Response , next:NextFunction){
    try{
        const userIP = req.header('cf-connecting-ip') || req.header('x-forwarded-for')?.split(',')[0] || req.ip
        if(!userIP){
            return res.status(400).json({
                status:false,
                message:"No User IP is Provided"
            })
        }

        const key = `rateLimit:${userIP}`
        const requestCount = await redis.incr(key)

        if(requestCount === 1){
            await redis.expire(key , TTL)
        }

        if(requestCount > thresholdValue){
            return res.status(429).json({
                status:false,
                message:"Too many requests, please try again later."
            })
        }

        next()
    }
    catch(error:any){
        console.log(`Error in Rate Limit ${error?.message}`)
    }
    finally{

    }
}

export default rateLimitUser