import dotenv from 'dotenv'
import path from 'path'
import { Groq } from 'groq-sdk'

dotenv.config({
    path: path.join(__dirname, '..', '.env')
})

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
    maxRetries: 3,
})

interface GroqResponse {
    response: string,
    reasoning?: string | undefined | null
}
/**
 * 
 * @param message 
 * @param systemPrompt 
 * @returns {response , reasoning}
 */
async function generateChat(message: string, systemPrompt: string): Promise<GroqResponse> {
    let retries = 0
    const maxRetries = 3
    const baseDelay = 1000 // 1 second

    while (retries < maxRetries) {
        try {
            const chat = await groq.chat.completions.create({
                model:"openai/gpt-oss-120b",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: message }
                ],
                max_completion_tokens: 1000 // Reduced from 8192
            })

            const firstChoice = chat?.choices?.[0]
            const content = firstChoice?.message?.content

            if (!content) {
                throw new Error('No Response Generated');
            }

            return { response: content, reasoning: chat?.choices[0]?.message?.reasoning }
        }
        catch (error: any) {
            const errorCode = error?.error?.code || error?.status
            const isRateLimit = errorCode === 'rate_limit_exceeded' || error?.status === 429
            
            if (isRateLimit && retries < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, retries) // Exponential backoff
                console.warn(`Rate limit hit. Retry ${retries + 1}/${maxRetries} after ${delay}ms`)
                await new Promise(resolve => setTimeout(resolve, delay))
                retries++
            } else {
                console.error("Error While Generating Text From AI:", {
                    message: error?.message,
                    code: errorCode,
                    status: error?.status,
                    retry: retries
                })
                throw new Error(error?.message || "No Message Generated")
            }
        }
    }

    throw new Error("Max retries exceeded for AI generation")
}

export default generateChat