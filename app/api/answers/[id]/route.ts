import { NextRequest, NextResponse } from "next/server";
import { getAnswer } from "@/lib/answer-store";

interface RouteParams {
  params: {
    id: string;
  };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = params;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid answer id" }, { status: 400 });
  }

  const answer = getAnswer(id);

  if (!answer) {
    return NextResponse.json({ error: "Answer not found" }, { status: 404 });
  }

  return NextResponse.json({ answer }, { status: 200 });
}

