interface SystemResponse {
    calculated: {
        memUsedMB: number,
        memUsedPercent: number,
        isHighCPU: boolean,
        isHighMemory: boolean
    },
    status: 'healthy' | 'critical' | 'warning',
    alertMessage: string
}

interface RawData{
    cpuPercent:number,
    memTotalMB:number,
    memFreeMB:number,
    loadAvg1m:number,
    loadAvg5m:number,
    loadAvg15m:number
    coreCount:number,
    processHeapMB:number,
    platform:string,
    uptime:number,
    processUptime:number,
    calculated:{
        memUsedMB:number,
        memUsedPercent:number,
        isHighCpu:boolean,
        isHighMemory:boolean
    },
    status:'health' | 'warning' | 'critical',
    alertMessage:string,
}

function getSystemResult(rawData:RawData):(SystemResponse | null){
    try{
        const isHighCPU = (Number(rawData.cpuPercent) > 80 ? true : false)
        const memUsedPercent = (Number(rawData.memFreeMB) / Number(rawData.memTotalMB)) * 100
        const isHighMemory = (memUsedPercent > 80 ? true : false)
        let status:SystemResponse['status'] = 'healthy'

        if(isHighCPU || isHighMemory){
            status = "warning"
        }
        if(Number(rawData.cpuPercent) > 90 || memUsedPercent > 90){
            status = "critical"
        }

        const alertMessage:SystemResponse['alertMessage'] = (status !== "healthy" ? `System is Not Healthy High Memory & CPU Consumption` : "No System Alert")
        return {
            calculated:{
                memUsedMB:Number(rawData.memTotalMB) - Number(rawData.memFreeMB),
                memUsedPercent:memUsedPercent,
                isHighCPU:isHighCPU,
                isHighMemory:isHighMemory
            },
            status,
            alertMessage
        }
    }
    catch(error:any){
        console.log("Error While Calculating System Data" + error?.message)
        return null
    }
}

export default getSystemResult