import { NextResponse } from "next/server"
import { BACKEND_URL } from "@/lib/config"

export async function POST(request: Request) {
  try {
    const { question, site_id } = await request.json()

    if (!question || !site_id) {
      return NextResponse.json({ error: "Question and site_id are required" }, { status: 400 })
    }

    const resp = await fetch(`${BACKEND_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, site_id }),
      cache: "no-store",
    })

    if (!resp.ok) {
      const text = await resp.text()
      console.error("[api/chat] backend error:", resp.status, text)
      return NextResponse.json({ error: "Failed to process chat message" }, { status: 500 })
    }

    const data = await resp.json()
    // Ensure sources are in expected shape { url, title? }
    const sources = Array.isArray(data.sources)
      ? data.sources.map((u: string | { url: string; title?: string }) =>
          typeof u === "string" ? { url: u } : u,
        )
      : []

    return NextResponse.json({ answer: data.answer, sources })
  } catch (error) {
    console.error("[api/chat] error:", error)
    return NextResponse.json({ error: "Failed to process chat message" }, { status: 500 })
  }
}
