import mongoose, { Document, Schema } from 'mongoose'
export interface IRedisSnapshot {
    raw: {
        latencyMs: number,
        memUsedMB: number,
        memMaxMB: number,
        connectedClients: 5,
        commandPerSec: 1200,
        evictedKeys: number
    },
    calculated: {
        hitRate: number,  // hits/(hits+misses)*100
        memUsedPercent: number, // memUsed/memMax*100
        isHighLatency: boolean, // latency > 100Ms
        isEvicting: boolean, // evictedKeys > 0
        isLowHitRate:number// hitRate < 60
    },
    alertMessage: string,
    captureAt: Date,
    status: 'healthy' | 'warning' | 'critical'
}

const RedisSnapshotSchema = new Schema<IRedisSnapshot>({
    raw: {
        latencyMs: { type: Number, required: true },
        memUsedMB: { type: Number, default: 0 },
        memMaxMB: { type: Number, default: 0 },
        connectedClients: { type: Number, default: 0 },
        commandsPerSec: { type: Number, default: 0 },
        evictedKeys: { type: Number, default: 0 },
    },

    calculated: {
        hitRate: { type: Number, default: 0 },
        memUsedPercent: { type: Number, default: 0 },
        isHighLatency: { type: Boolean, default: false },
        isEvicting: { type: Boolean, default: false },
        isLowHitRate: { type: Boolean, default: false },
    },

    status: {
        type: String,
        enum: ['healthy', 'warning', 'critical'],
        default: 'healthy'
    },
    alertMessage: { type: String },
    captureAt: { type: Date, default: Date.now },
}, { timestamps: false })

RedisSnapshotSchema.index({ captureAt: -1 })
RedisSnapshotSchema.index(
    { captureAt: 1 },
    { expireAfterSeconds: 864000 }
)

export const RedisSnapshot = mongoose.model<IRedisSnapshot>(
    'RedisSnapshot', RedisSnapshotSchema
)