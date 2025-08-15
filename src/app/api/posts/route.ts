import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const posts = await db.post.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        author: true,
      },
    });
    return NextResponse.json(posts);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch posts" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, content, authorId, published } = body;

    if (!title || !authorId) {
      return NextResponse.json(
        { error: "Title and author ID are required" },
        { status: 400 }
      );
    }

    const post = await db.post.create({
      data: {
        title,
        content: content || null,
        authorId,
        published: published || false,
      },
    });

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 }
    );
  }
}