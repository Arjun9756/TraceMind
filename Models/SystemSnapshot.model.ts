import mongoose , {Document , Schema} from 'mongoose'
export interface ISystemSnapshot{
    raw:{
        cpuPercent:number,
        memTotalMB:number,
        memFreeMB:number,
        loadAvg1M:number,
        loadAvg5M:number,
        loadAvg15M:number,
        processHeapMB:number,
        coreCount:number,
        platform:string,
        uptime:number,
        processUptime:number
    },
    calculated:{
        isHighCPU:boolean,
        isHighMemory:boolean,
        memUsedPercent:number,
        memUsedMB:number
    },
    status: 'healthy' | 'warning' | 'critical'
    alertMessage:string,
    capturedAt: Date
}


const SystemSnapshotSchema = new Schema<ISystemSnapshot>({
  raw: {
    cpuPercent:    { type: Number, required: true },
    memTotalMB:    { type: Number, required: true },
    memFreeMB:     { type: Number, required: true },
    loadAvg1m:     { type: Number, default: 0 },
    loadAvg5m:     { type: Number, default: 0 },
    loadAvg15m:    { type: Number, default: 0 },
    coreCount:     { type: Number, default: 1 },
    processHeapMB: { type: Number, default: 0 },
    processRssMB:  { type: Number, default: 0 },
    uptime:        { type: Number, default: 0 },
    processUptime: { type: Number, default: 0 },
  },

  calculated: {
    memUsedMB:      { type: Number,  default: 0 },
    memUsedPercent: { type: Number,  default: 0 },
    isHighCPU:      { type: Boolean, default: false },
    isHighMemory:   { type: Boolean, default: false },
  },
  status: {
    type: String,
    enum: ['healthy', 'warning', 'critical'],
    default: 'healthy'
  },
  alertMessage:{type:String},
  capturedAt: { type: Date, default: Date.now },
}, { timestamps: false })

SystemSnapshotSchema.index({capturedAt:-1} , {expireAfterSeconds:864000})

export const SystemSnapshot = mongoose.model<ISystemSnapshot>(
  'SystemSnapshot', SystemSnapshotSchema
)