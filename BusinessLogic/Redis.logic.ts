import redis from '../Utility/Redis.config'
import { IRedisSnapshot } from '../Models/RedisEvent.model'

interface RedisResponse {
    calculated: {
        hitRate: number,  // hits/(hits+misses)*100
        memUsedPercent: number, // memUsed/memMax*100
        isHighLatency: boolean, // latency > 100Ms
        isEvicting: boolean, // evictedKeys > 0
        isLowHitRate: boolean// hitRate < 60
    },
    alertMessage: string,
    status: 'healthy' | 'warning' | 'critical'
}

function getRedisResult(rawData: IRedisSnapshot['raw']): (RedisResponse) {
    const total = Number(rawData.keySpaceHits) + Number(rawData.keySpaceMisses)
    const hitRate = total > 0 ? Number((Number(rawData.keySpaceHits) / total * 100).toFixed(3)) : 0;

    const memUsedPercent = rawData.memMaxMB > 0 ? Number((Number(rawData.memUsedMB) / Number(rawData.memMaxMB) * 100).toFixed(3)) : 0;
    const isHighLatency = Number(rawData.latencyMs) > 100 ? true : false
    const isLowHitRate = Number(hitRate) < 60 ? true : false
    const isEvicting = Number(rawData.evictedKeys) > 0
    const isHighMem = memUsedPercent > 60 

    let status: IRedisSnapshot['status'] = 'healthy'
    let alertMessage: string = "No Critical Issue"

    // Priority-based status assignment
    if (isHighLatency || isEvicting) {
        status = 'critical';
        alertMessage = isHighLatency ? "High Latency detected" : "System is evicting keys";
    } else if (isLowHitRate || isHighMem) {
        status = 'warning';
        alertMessage = isLowHitRate ? "Low hit rate (below 60%)" : `High memory usage: ${memUsedPercent}%`;
    }

    return {
        calculated: {
            hitRate,
            memUsedPercent,
            isHighLatency,
            isEvicting,
            isLowHitRate
        },
        status,
        alertMessage
    };
}

export default getRedisResult