import mongoose from "mongoose"
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({
    path:path.join(__dirname , '..' , '.env')
})

/**
 * @alias ConnectMyDB
 * @description {Connect to Mongo Database Any Issue is Generated Will Stop The Whole Server}
 */

async function connectToMongo(){
    try{
        const database = await mongoose.connect(process.env.MONGO_URI as string)
        console.log("Mongo Database Connected")
    }
    catch(error:any){
        console.log(`Mongo DB Connection Error ${error?.message}`)
        process.exit(1)
    }
}

export default connectToMongo