import mongoose , {Document, Schema } from "mongoose";
export interface IQueueSnapshot extends Document{
    queueName:string,
    raw:{
        waiting:Number,
        active:Number,
        completed:Number,
        failed:Number,
        delayed:Number,
        stalledCount:Number,
        councurrency:Number
    },
    calculated:{
        growthRate:Number, // currWaiting - prevWaiting
        failureRate:Number, // (completed + failed) / failed * 100
        avgProcessingMs:Number, // avg of prev 5 processingMs
        zScore:Number,
        isGhostFauilure:boolean, // waiting > 0 && active <= 0 how ??
    },
    status:'healthy' | 'warning' | 'critical' | 'ghostFailure',
    alertMessage:String,
    captureAt:Date
}

const QueueSnapshotSchema = new Schema<IQueueSnapshot>({
    queueName:{
        type:String,
        require:true
    },
    raw:{
        waiting:{type:Number , default:0},
        active:{type:Number , default:0},
        completed:{type:Number , default:0},
        failed:{type:Number , default:0},
        delayed:{type:Number , default:0},
        stalledCount:{type:Number , default:0},
        concurrency:{type:Number , default:1}
    },
    calculated:{
        growthRate:{type:Number , default:0},
        failureRate:{type:Number , default:0},
        avgProcessingMs:{type:Number , default:0},
        zScore:{type:Number , default:0},
        isGhostFailure:{type:Number , default:false},
    },
    status:{
        type:String,
        enum:["healthy" , "warning" , "critical" , "ghostFailure"],
        require:true
    },
    alertMessage:String,
    captureAt:{type:Date , default:Date.now()}
},{timestamps:false})

QueueSnapshotSchema.index({queueName:1 , captureAt:-1})
QueueSnapshotSchema.index({captureAt:-1} , {expireAfterSeconds:864000}) // 10 days 60 * 60 * 24 * 10

export const QueueSnapshot = mongoose.model<IQueueSnapshot>('QueueSnapshot' , QueueSnapshotSchema)