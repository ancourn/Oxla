import { NextResponse } from "next/server";
import ZAI from 'z-ai-web-dev-sdk';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query, num } = body;

    if (!query) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    const zai = await ZAI.create();

    const searchResult = await zai.functions.invoke("web_search", {
      query,
      num: num || 10,
    });

    return NextResponse.json({
      results: searchResult,
    });

  } catch (error) {
    return NextResponse.json(
      { error: "Failed to process search request" },
      { status: 500 }
    );
  }
}