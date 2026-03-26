import dotenv from 'dotenv'
import path from 'path'
import { Groq } from 'groq-sdk'

dotenv.config({
    path: path.join(__dirname, '..', '.env')
})

console.log(process.env.GROQ_API_KEY)

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
    try {
        const chat = await groq.chat.completions.create({
            model:"openai/gpt-oss-120b",
            messages: [
                { role: "user", content: message },
                { role: "system", content: systemPrompt },
                { role: "assistant", content: "Provide The Result in Much More Cleaner Way" }
            ],
            reasoning_effort: "medium",
            max_completion_tokens: 8192
        })

        const firstChoice = chat?.choices?.[0]
        const content = firstChoice?.message?.content

        if (!content) {
            throw new Error('No Response Generated');
        }

        return { response: content, reasoning: chat?.choices[0]?.message?.reasoning }
    }
    catch (error: any) {
        console.log("Error While Generating Text From AI")
        throw new Error(error?.message || "No Message Generated")
    }
}

export default generateChat