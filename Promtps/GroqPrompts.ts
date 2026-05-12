export const JOB_SYSTEM_PROMPT = `Analyze job event. Response ONLY JSON: {"summary": "brief (15 words)", "reason": "why (20 words)", "action": "fix (20 words)", "severity": "low|medium|high|critical", "isAnomaly": bool}
Rules: isRetryStorm=HIGH, zScore>3=HIGH, zScore>5=CRITICAL, status=failed+maxAttempt=HIGH, time>30s=CRITICAL, failed+anomaly=CRITICAL`

export const QUEUE_SYSTEM_PROMPT = `Analyze queue data. Response ONLY JSON: {"summary": "brief (15 words)", "reason": "why (20 words)", "action": "fix (20 words)", "severity": "low|medium|high|critical", "isAnomaly": bool}
Rules: waiting>0+active=0=CRITICAL, failure>10%=HIGH, growth>20%=WARNING, stalledCount>0=HIGH, zScore>3=ANOMALY`

export const REDIS_SYSTEM_PROMPT = `Analyze Redis data. Response ONLY JSON: {"summary": "brief (15 words)", "reason": "why (20 words)", "action": "fix (20 words)", "severity": "low|medium|high|critical", "isAnomaly": bool}
Rules: latency>100ms=HIGH, latency>500ms=CRITICAL, memory>90%=CRITICAL, hitRate<50%=HIGH, evicted>1000=HIGH`

export const SYSTEM_SYSTEM_PROMPT = `Analyze system metrics. Response ONLY JSON: {"summary": "brief (15 words)", "reason": "why (20 words)", "action": "fix (20 words)", "severity": "low|medium|high|critical", "isAnomaly": bool}
Rules: cpu>90%=CRITICAL, cpu>70%=HIGH, memory>90%=CRITICAL, memory>70%=HIGH, load>cores=HIGH, load>2x=CRITICAL`