import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

export async function POST(request: NextRequest) {
  try {
    const { query, results } = await request.json()
    
    if (!query || !results) {
      return NextResponse.json({ error: 'Query and results are required' }, { status: 400 })
    }

    // Initialize ZAI SDK
    const zai = await ZAI.create()

    // Create a prompt for AI insights
    const prompt = `
      Based on the following search results for the query "${query}", please provide a comprehensive analysis and insights:

      Search Results:
      ${results.map((result: any, index: number) => `
        ${index + 1}. ${result.name}
           URL: ${result.url}
           Snippet: ${result.snippet}
           Host: ${result.host_name}
      `).join('\n')}

      Please provide:
      1. A summary of the key findings
      2. Main themes or patterns across the results
      3. Important insights or takeaways
      4. Any notable sources or authorities mentioned
      5. Recommendations for further research

      Keep the response concise but informative, around 200-300 words.
    `

    // Generate AI insights
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are an expert research analyst who provides insightful summaries of search results. Your analysis should be objective, comprehensive, and helpful for understanding the topic quickly.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    })

    const insights = completion.choices[0]?.message?.content || ''

    return NextResponse.json({ 
      insights: insights.trim(),
      query: query 
    })
  } catch (error) {
    console.error('AI insights error:', error)
    return NextResponse.json({ error: 'Failed to generate AI insights' }, { status: 500 })
  }
}