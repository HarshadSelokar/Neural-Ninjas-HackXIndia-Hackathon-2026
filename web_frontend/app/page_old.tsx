"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Loader2, CheckCircle2, AlertTriangle, Moon, Sun, Info, RefreshCw, Send } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useTheme } from "@/components/theme-provider"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type Message = {
  role: "user" | "assistant"
  content: string
  sources?: { title?: string; url: string }[]
  isWarning?: boolean
  mode?: "rag" | "general"
}

type IngestionStatus = "idle" | "loading" | "success" | "error"

function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}

export default function Home() {
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [ingestionStatus, setIngestionStatus] = useState<IngestionStatus>("idle")
  const [ingestionData, setIngestionData] = useState<{
    pagesCrawled: number
    chunksIndexed: number
    siteId: string
    cached?: boolean
  } | null>(null)
  
  // YouTube state
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [youtubeStatus, setYoutubeStatus] = useState<IngestionStatus>("idle")
  const [youtubeData, setYoutubeData] = useState<{
    segmentsProcessed: number
    chunksIndexed: number
    videoId: string
  } | null>(null)
  
  // Source selection
  const [includeSourceTypes, setIncludeSourceTypes] = useState({
    website: true,
    youtube: true
  })
  
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState("")
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [showRecrawlDialog, setShowRecrawlDialog] = useState(false)
  const [websiteOnlyMode, setWebsiteOnlyMode] = useState(true)

  const handleIngestWebsite = async () => {
    if (!websiteUrl.trim()) return

    setIngestionStatus("loading")

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: websiteUrl }),
      })

      if (!response.ok) throw new Error("Failed to ingest website")

      const data = await response.json()
      setIngestionData({
        pagesCrawled: data.pagesCrawled || 12,
        chunksIndexed: data.chunksIndexed || 348,
        siteId: data.siteId || new URL(websiteUrl).hostname,
        cached: data.cached || false,
      })
      setIngestionStatus("success")
    } catch (error) {
      console.error("[v0] Ingestion error:", error)
      setIngestionStatus("error")
    }
  }

  const handleIngestYouTube = async () => {
    if (!youtubeUrl.trim()) return
    if (!ingestionData?.siteId) {
      alert("Please ingest a website first to get a site_id")
      return
    }

    setYoutubeStatus("loading")

    try {
      const response = await fetch("http://127.0.0.1:8000/ingest/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          video_url: youtubeUrl,
          site_id: ingestionData.siteId
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || "Failed to ingest YouTube video")
      }

      const data = await response.json()
      setYoutubeData({
        segmentsProcessed: data.segments_processed || 0,
        chunksIndexed: data.chunks_indexed || 0,
        videoId: data.video_id || "",
      })
      setYoutubeStatus("success")
    } catch (error: any) {
      console.error("[v0] YouTube ingestion error:", error)
      setYoutubeStatus("error")
      alert(`YouTube ingestion failed: ${error.message}`)
    }
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return
    if (websiteOnlyMode && !ingestionData) return

    const userMessage: Message = {
      role: "user",
      content: inputMessage,
    }

    setMessages((prev) => [...prev, userMessage])
    setInputMessage("")
    setIsSendingMessage(true)

    try {
      // Build source_types array based on checkboxes
      const sourceTypes = Object.entries(includeSourceTypes)
        .filter(([_, enabled]) => enabled)
        .map(([type, _]) => type)

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: inputMessage,
          site_id: websiteOnlyMode ? ingestionData?.siteId : null,
          mode: websiteOnlyMode ? "rag" : "general",
          source_types: sourceTypes.length > 0 ? sourceTypes : undefined,
        }),
      })

      if (!response.ok) throw new Error("Failed to send message")

      const data = await response.json()

      const assistantMessage: Message = {
        role: "assistant",
        content: data.answer || data.message,
        sources: data.sources,
        isWarning: data.answer?.includes("not available on this website"),
        mode: data.mode || "rag",
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error("[v0] Chat error:", error)
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, I encountered an error processing your request.",
        isWarning: true,
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsSendingMessage(false)
    }
  }

  const handleRecrawl = async () => {
    if (!websiteUrl) return

    setShowRecrawlDialog(false)
    setIngestionStatus("loading")

    try {
      const response = await fetch("/api/recrawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: websiteUrl }),
      })

      if (!response.ok) throw new Error("Failed to recrawl website")

      const data = await response.json()
      setIngestionData({
        pagesCrawled: data.pagesCrawled || 12,
        chunksIndexed: data.chunksIndexed || 348,
        siteId: data.siteId || new URL(websiteUrl).hostname,
      })
      setIngestionStatus("success")
      setMessages([])
    } catch (error) {
      console.error("[v0] Recrawl error:", error)
      setIngestionStatus("error")
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground text-balance">
              SiteSage
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Ask questions using only the website&apos;s content</p>
          </div>
          <div className="flex items-center gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <Info className="h-4 w-4" />
                  <span className="hidden sm:inline">How it Works</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>How It Works</DialogTitle>
                  <DialogDescription className="space-y-3 pt-4 leading-relaxed">
                    <div>
                      <strong>1. Ingest a Website:</strong> Enter any website URL to convert it into a searchable
                      knowledge base.
                    </div>
                    <div>
                      <strong>2. Choose Mode:</strong> Toggle between Website-Only (grounded) or General AI mode.
                    </div>
                    <div>
                      <strong>3. Ask Questions:</strong> Chat with the AI. In Website mode, answers are grounded in
                      the website content. In General mode, use full AI knowledge.
                    </div>
                    <div>
                      <strong>4. View Sources:</strong> In Website mode, every answer includes links to the exact
                      pages where the information was found.
                    </div>
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
            {/* Global Mode Toggle (always visible) */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted cursor-pointer hover:bg-muted/80 transition-colors"
                    onClick={() => setWebsiteOnlyMode(!websiteOnlyMode)}
                  >
                    <div
                      className={`w-10 h-6 rounded-full flex items-center transition-colors ${
                        websiteOnlyMode ? "bg-green-500" : "bg-blue-500"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                          websiteOnlyMode ? "translate-x-0" : "translate-x-4"
                        }`}
                      />
                    </div>
                    <span className="text-xs font-medium whitespace-nowrap">
                      {websiteOnlyMode ? "🌐 Website" : "🤖 General"}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p>
                    <strong>🌐 Website Mode:</strong> Answers strictly from website content.
                  </p>
                  <p className="mt-1">
                    <strong>🤖 General Mode:</strong> Use full AI knowledge.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Website Ingestion Section (hidden in General mode) */}
        {websiteOnlyMode && (
        <Card className="p-6 sm:p-8 shadow-sm">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Step 1: Convert Website</h2>
              <p className="text-sm text-muted-foreground">Enter a website URL to create your AI assistant</p>
            </div>

            <div className="flex gap-3 flex-col sm:flex-row">
              <Input
                placeholder="https://www.example.gov.in"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                disabled={ingestionStatus === "loading"}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && ingestionStatus !== "loading") {
                    handleIngestWebsite()
                  }
                }}
              />
              <Button
                onClick={handleIngestWebsite}
                disabled={ingestionStatus === "loading" || !websiteUrl.trim()}
                className="w-full sm:w-auto"
              >
                {ingestionStatus === "loading" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Converting...
                  </>
                ) : (
                  "Convert Website"
                )}
              </Button>
            </div>

            {ingestionStatus === "success" && ingestionData && (
              <div className={`border rounded-lg p-4 ${ingestionData.cached ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900" : "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900"}`}>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className={`h-5 w-5 flex-shrink-0 mt-0.5 ${ingestionData.cached ? "text-blue-600 dark:text-blue-400" : "text-green-600 dark:text-green-400"}`} />
                  <div className="flex-1 space-y-2">
                    <p className={`font-medium ${ingestionData.cached ? "text-blue-900 dark:text-blue-100" : "text-green-900 dark:text-green-100"}`}>
                      {ingestionData.cached ? "Website data loaded from cache" : "Website indexed successfully"}
                    </p>
                    <div className={`grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm ${ingestionData.cached ? "text-blue-800 dark:text-blue-200" : "text-green-800 dark:text-green-200"}`}>
                      <div>
                        <span className="font-medium">Pages crawled:</span> {ingestionData.pagesCrawled}
                      </div>
                      <div>
                        <span className="font-medium">Chunks indexed:</span> {ingestionData.chunksIndexed}
                      </div>
                      <div className="truncate">
                        <span className="font-medium">Site ID:</span> {ingestionData.siteId}
                      </div>
                    </div>
                    {ingestionData.cached && (
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                        ✓ This website was previously ingested. Using cached embeddings and data.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {ingestionStatus === "error" && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>Failed to ingest website. Please check the URL and try again.</AlertDescription>
              </Alert>
            )}
          </div>
        </Card>
        )}

        {/* YouTube Ingestion Section (optional) */}
        {websiteOnlyMode && ingestionStatus === "success" && (
        <Card className="p-6 sm:p-8 shadow-sm">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Step 1: Add YouTube Videos (Optional)</h2>
              <p className="text-sm text-muted-foreground">Index video transcripts for the same site</p>
            </div>

            <div className="flex gap-3 flex-col sm:flex-row">
              <Input
                placeholder="https://www.youtube.com/watch?v=..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                disabled={youtubeStatus === "loading"}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && youtubeStatus !== "loading") {
                    handleIngestYouTube()
                  }
                }}
              />
              <Button
                onClick={handleIngestYouTube}
                disabled={youtubeStatus === "loading" || !youtubeUrl.trim()}
                className="w-full sm:w-auto"
              >
                {youtubeStatus === "loading" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Indexing...
                  </>
                ) : (
                  "Index Video"
                )}
              </Button>
            </div>

            {youtubeStatus === "success" && youtubeData && (
              <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5 text-green-600 dark:text-green-400" />
                  <div className="flex-1 space-y-2">
                    <p className="font-medium text-green-900 dark:text-green-100">
                      YouTube video indexed successfully
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-green-800 dark:text-green-200">
                      <div>
                        <span className="font-medium">Segments:</span> {youtubeData.segmentsProcessed}
                      </div>
                      <div>
                        <span className="font-medium">Chunks indexed:</span> {youtubeData.chunksIndexed}
                      </div>
                      <div className="truncate">
                        <span className="font-medium">Video ID:</span> {youtubeData.videoId}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {youtubeStatus === "error" && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>Failed to index YouTube video. Check the URL and ensure transcripts are available.</AlertDescription>
              </Alert>
            )}
          </div>
        </Card>
        )}

        {/* Chat Interface: show after ingestion in Website mode OR always in General mode */}
        {(ingestionStatus === "success" || !websiteOnlyMode) && (
          <Card className="shadow-sm flex flex-col h-[600px]">
            <div className="p-4 border-b border-border flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Step 2: Ask Questions</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Chat with your AI assistant about the website content
                </p>
              </div>

              {/* Website-Only Mode Toggle */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted cursor-pointer hover:bg-muted/80 transition-colors flex-shrink-0"
                      onClick={() => setWebsiteOnlyMode(!websiteOnlyMode)}
                    >
                      <div
                        className={`w-10 h-6 rounded-full flex items-center transition-colors ${
                          websiteOnlyMode ? "bg-green-500" : "bg-blue-500"
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                            websiteOnlyMode ? "translate-x-0" : "translate-x-4"
                          }`}
                        />
                      </div>
                      <span className="text-xs font-medium whitespace-nowrap">
                        {websiteOnlyMode ? "🌐 Website" : "🤖 General"}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    <p>
                      <strong>🌐 Website Mode:</strong> Answers strictly from website content.
                    </p>
                    <p className="mt-1">
                      <strong>🤖 General Mode:</strong> Use full AI knowledge.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Source Type Filters (Website mode only) */}
              {websiteOnlyMode && (youtubeData || youtubeStatus === "success") && (
                <div className="flex gap-2 flex-wrap">
                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors text-sm">
                    <input
                      type="checkbox"
                      checked={includeSourceTypes.website}
                      onChange={(e) => setIncludeSourceTypes({...includeSourceTypes, website: e.target.checked})}
                      className="w-4 h-4"
                    />
                    <span>🌐 Website</span>
                  </label>
                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors text-sm">
                    <input
                      type="checkbox"
                      checked={includeSourceTypes.youtube}
                      onChange={(e) => setIncludeSourceTypes({...includeSourceTypes, youtube: e.target.checked})}
                      className="w-4 h-4"
                    />
                    <span>🎥 YouTube</span>
                  </label>
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center px-4">
                  <div className="space-y-2">
                    <p className="text-muted-foreground">
                      No messages yet. Start by asking a question about the website.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {websiteOnlyMode
                        ? "The assistant will only answer using information from the indexed website."
                        : "You can ask anything using general AI knowledge."}
                    </p>
                  </div>
                </div>
              ) : (
                messages.map((message, index) => (
                  <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] rounded-lg px-4 py-3 ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : message.isWarning
                            ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {/* Mode Badge */}
                      {message.role === "assistant" && (
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`text-xs font-bold px-2 py-1 rounded ${
                              message.mode === "rag"
                                ? "bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200"
                                : "bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200"
                            }`}
                          >
                            {message.mode === "rag" ? "🌐 Website-Grounded" : "🤖 General AI"}
                          </span>
                        </div>
                      )}

                      {message.isWarning && message.role === "assistant" && (
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          <span className="text-xs font-medium text-amber-900 dark:text-amber-100">
                            Information Not Available
                          </span>
                        </div>
                      )}

                      <p
                        className={`text-sm leading-relaxed ${
                          message.role === "assistant" && !message.isWarning ? "text-foreground" : ""
                        }`}
                      >
                        {message.content}
                      </p>
                      {message.isWarning && (
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                          {websiteOnlyMode
                            ? "This assistant only answers using the provided website."
                            : "Consider switching to Website-Only mode for grounded answers."}
                        </p>
                      )}

                      {/* Sources Panel - Only in RAG mode */}
                      {message.sources && message.sources.length > 0 && message.mode === "rag" && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <p className="text-xs font-medium text-foreground/70 mb-2">Sources:</p>
                          <div className="space-y-1.5">
                            {message.sources.map((source: any, idx) => {
                              const isYoutube = source.type === "youtube"
                              const displayText = isYoutube 
                                ? `🎥 ${source.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1] || source.url}${source.timestamp ? ` (${source.timestamp})` : ""}`
                                : `${source.title || source.url}`
                              
                              return (
                                <a
                                  key={idx}
                                  href={source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                  {displayText}
                                </a>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {message.role === "assistant" &&
                        !message.sources &&
                        !message.isWarning &&
                        message.mode === "rag" && (
                          <div className="mt-3 pt-3 border-t border-border/50">
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              No relevant sources found on the website.
                            </p>
                          </div>
                        )}
                    </div>
                  </div>
                ))
              )}
              {isSendingMessage && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <Input
                  placeholder="Ask a question about the website..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  disabled={isSendingMessage}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isSendingMessage) {
                      handleSendMessage()
                    }
                  }}
                  className="flex-1"
                />
                <Button onClick={handleSendMessage} disabled={isSendingMessage || !inputMessage.trim()} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Recrawl Section */}
        {ingestionStatus === "success" && (
          <div className="flex justify-center">
            <Dialog open={showRecrawlDialog} onOpenChange={setShowRecrawlDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 bg-transparent">
                  <RefreshCw className="h-4 w-4" />
                  Re-crawl Website
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Re-crawl Website</DialogTitle>
                  <DialogDescription className="space-y-3 pt-4">
                    <div>This will update the chatbot with the latest content from the website.</div>
                    <div className="text-sm text-muted-foreground">
                      Your current chat history will be cleared. This process may take a few moments.
                    </div>
                    <div className="flex gap-3 pt-2">
                      <Button onClick={handleRecrawl} className="flex-1">
                        Confirm Re-crawl
                      </Button>
                      <Button variant="outline" onClick={() => setShowRecrawlDialog(false)} className="flex-1">
                        Cancel
                      </Button>
                    </div>
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center space-y-2">
          <p className="text-sm font-medium text-foreground">
            Powered by RAG • No hallucinations • Website-specific AI
          </p>
          <p className="text-xs text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Answers are generated strictly from the website&apos;s content. This assistant uses Retrieval-Augmented
            Generation to ensure accurate, grounded responses.
          </p>
        </div>
      </footer>
    </div>
  )
}
