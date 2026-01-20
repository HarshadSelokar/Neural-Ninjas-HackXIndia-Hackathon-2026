import { NextResponse } from "next/server"
import { BACKEND_URL } from "@/lib/config"

export async function POST(request: Request) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 })
    }

    const resp = await fetch(`${BACKEND_URL}/recrawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      cache: "no-store",
    })

    if (!resp.ok) {
      const text = await resp.text()
      console.error("[api/recrawl] backend error:", resp.status, text)
      return NextResponse.json({ error: "Failed to recrawl website" }, { status: 500 })
    }

    const data = await resp.json()
    return NextResponse.json({
      success: data.status === "success",
      pagesCrawled: data.pages_crawled ?? data.pagesCrawled ?? 0,
      chunksIndexed: data.chunks_indexed ?? data.chunksIndexed ?? 0,
      siteId: data.site_id ?? new URL(url).hostname,
    })
  } catch (error) {
    console.error("[api/recrawl] error:", error)
    return NextResponse.json({ error: "Failed to recrawl website" }, { status: 500 })
  }
}
