import { NextResponse } from "next/server";
import ZAI from 'z-ai-web-dev-sdk';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, temperature, max_tokens } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 }
      );
    }

    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages,
      temperature: temperature || 0.7,
      max_tokens: max_tokens || 1000,
    });

    const messageContent = completion.choices[0]?.message?.content;
    if (messageContent) {
      return NextResponse.json({
        response: messageContent,
        fullResponse: completion,
      });
    } else {
      return NextResponse.json(
        { error: "Failed to get response from AI" },
        { status: 500 }
      );
    }

  } catch (error) {
    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 }
    );
  }
}