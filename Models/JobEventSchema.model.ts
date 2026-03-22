import mongoose, { Document, mongo, Schema } from 'mongoose'
export interface IJobEvent {
    queueName: string,
    jobId: number,
    processingMs: number,
    attemptMade: number,
    maxAttempt: number,
    status: "completed" | "failed",
    errorMessage: string,
    calculated: {
        isRetryStrom: boolean, // attemptsMade >= maxAttempts * 0.7
        isAnomaly: boolean,
        zScore: number,
        avgAtTime: number
    },
    timestamp:Date
}

const JobEventSchema = new Schema<IJobEvent>({
    queueName: { type: String, require: true },
    jobId: { type: Number, required: true },
    processingMs: { type: Number, required: true },
    attemptMade: { type: Number, required: true },
    maxAttempt: { type: Number, required: true },
    status: {
        type: String,
        enum: ["completed", "failed"],
        required: true
    },
    errorMessage: {
        type: String
    },
    calculated: {
        isRetryStorm: { type: Boolean, default: false },
        isAnomaly: { type: Boolean, default: false },
        zScore: { type: Number, default: 0 },
        avgAtTime: { type: Number, default: 0 },
    },
    timestamp:{type:Date , default:Date.now()}
}, { timestamps: false })

JobEventSchema.index({queueName:1 , timestamp:-1})
JobEventSchema.index({queueName:1 , "calculated.isRetryStorm":1})
JobEventSchema.index({ queueName: 1, 'calculated.isAnomaly': 1 })
JobEventSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 864000 } // 10 din
)

export const JobEvent = mongoose.model<IJobEvent>('JobEvent' , JobEventSchema)