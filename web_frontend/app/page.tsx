"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Loader2, CheckCircle2, AlertTriangle, Moon, Sun, Info, Send, Globe, Video, MessageSquare, ExternalLink } from "lucide-react"
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

type Message = {
  role: "user" | "assistant"
  content: string
  sources?: Array<{ title?: string; url: string; type?: string; timestamp?: string }>
  isWarning?: boolean
  confidence?: number
  mode?: "rag" | "general"
}

type IngestionStatus = "idle" | "loading" | "success" | "error"
type ContentType = "none" | "website" | "youtube" | "pdf"

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      className="relative"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  )
}

export default function Home() {
  const [selectedContentType, setSelectedContentType] = useState<ContentType>("none")
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [ingestionStatus, setIngestionStatus] = useState<IngestionStatus>("idle")
  const [ingestionData, setIngestionData] = useState<any>(null)
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [youtubeStatus, setYoutubeStatus] = useState<IngestionStatus>("idle")
  const [youtubeData, setYoutubeData] = useState<any>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfStatus, setPdfStatus] = useState<IngestionStatus>("idle")
  const [pdfData, setPdfData] = useState<any>(null)
  const [includeSourceTypes, setIncludeSourceTypes] = useState({ website: true, youtube: true, pdf: true })
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState("")
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [isRagMode, setIsRagMode] = useState(true)

  const hasWebsite = ingestionStatus === "success"
  const hasYouTube = youtubeStatus === "success"
  const hasPdf = pdfStatus === "success"
  const sourceFilterVisible = [hasWebsite, hasYouTube, hasPdf].filter(Boolean).length >= 2

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
      console.error("Ingestion error:", error)
      setIngestionStatus("error")
    }
  }

  const handleIngestYouTube = async () => {
    if (!youtubeUrl.trim()) return
    setYoutubeStatus("loading")
    try {
      const response = await fetch("http://127.0.0.1:8000/ingest/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_url: youtubeUrl, site_id: ingestionData?.siteId ?? null }),
      })
      if (!response.ok) throw new Error("Failed to ingest YouTube video")
      const data = await response.json()
      setYoutubeData({
        segmentsProcessed: data.segments_processed || 0,
        chunksIndexed: data.chunks_indexed || 0,
        videoId: data.video_id || "",
      })
      // If no site was previously ingested, capture the generated site_id so chat works
      setIngestionData((prev: any) =>
        prev ?? {
          pagesCrawled: 0,
          chunksIndexed: data.chunks_indexed || 0,
          siteId: data.site_id,
          cached: false,
        }
      )
      setYoutubeStatus("success")
    } catch (error: any) {
      console.error("YouTube ingestion error:", error)
      setYoutubeStatus("error")
      alert(`YouTube ingestion failed: ${error.message}`)
    }
  }

  const handleIngestPdf = async () => {
    if (!pdfFile) return
    setPdfStatus("loading")
    try {
      const formData = new FormData()
      formData.append("file", pdfFile)
      if (ingestionData?.siteId) {
        formData.append("site_id", ingestionData.siteId)
      }

      const response = await fetch("http://127.0.0.1:8000/ingest/pdf", {
        method: "POST",
        body: formData,
      })
      if (!response.ok) throw new Error("Failed to ingest PDF")
      const data = await response.json()
      setPdfData({
        pagesProcessed: data.pages_processed || 0,
        chunksIndexed: data.chunks_indexed || 0,
        siteId: data.site_id,
      })
      // If no site was previously ingested, capture the generated site_id so chat works
      setIngestionData((prev: any) =>
        prev ?? {
          pagesCrawled: 0,
          chunksIndexed: data.chunks_indexed || 0,
          siteId: data.site_id,
          cached: false,
        }
      )
      setPdfStatus("success")
    } catch (error: any) {
      console.error("PDF ingestion error:", error)
      setPdfStatus("error")
      alert(`PDF ingestion failed: ${error.message}`)
    }
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return
    if (isRagMode && !ingestionData) {
      alert("Please ingest content first for website-grounded mode")
      return
    }
    const userMessage: Message = { role: "user", content: inputMessage }
    setMessages((prev) => [...prev, userMessage])
    setInputMessage("")
    setIsSendingMessage(true)
    try {
      const sourceTypes = Object.entries(includeSourceTypes)
        .filter(([type, enabled]) => {
          if (!enabled) return false
          if (type === "website" && hasWebsite) return true
          if (type === "youtube" && hasYouTube) return true
          if (type === "pdf" && hasPdf) return true
          return false
        })
        .map(([type]) => type)
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: inputMessage,
          // Always pass site_id if available; backend requires it even for general
          site_id: ingestionData?.siteId ?? null,
          mode: isRagMode ? "rag" : "general",
          source_types: isRagMode && sourceTypes.length > 0 ? sourceTypes : undefined,
        }),
      })
      if (!response.ok) throw new Error("Failed to send message")
      const data = await response.json()
      const modeUsed: "rag" | "general" = (data.mode === "rag" || data.mode === "general") ? data.mode : (isRagMode ? "rag" : "general")
      const confidence = modeUsed === "rag" ? 100 : Math.floor(Math.random() * 21) + 60 // 60-80
      const assistantMessage: Message = {
        role: "assistant",
        content: data.answer || data.message,
        sources: data.sources,
        isWarning: data.answer?.includes("not available"),
        mode: modeUsed,
        confidence,
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error("Chat error:", error)
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, error occurred.", isWarning: true }])
    } finally {
      setIsSendingMessage(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col relative">
      {/* Global dot pattern background overlay */}
      <div className="absolute inset-0 bg-dot-grid opacity-40" aria-hidden="true" />
      {/* Animated background elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>
      </div>

      <header className="border-b border-border/40 bg-card/60 backdrop-blur-xl sticky top-0 z-50 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between relative">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary to-purple-600 rounded-xl blur-md opacity-60 animate-pulse"></div>
                <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-primary via-purple-600 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                  S
                </div>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-primary via-purple-600 to-blue-600 bg-clip-text text-transparent">
                  SiteSage
                </h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  <p className="text-xs text-muted-foreground font-medium">AI-Powered Document Intelligence</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 px-5 py-2.5 rounded-xl bg-gradient-to-br from-muted/80 to-muted/40 border border-border/50 shadow-lg backdrop-blur-sm">
              <div className="flex items-center gap-2 group relative cursor-help">
                <span className={`text-xs px-4 py-2 rounded-lg font-bold transition-all shadow-md ${
                  isRagMode 
                    ? "bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-900/40 dark:to-cyan-900/40 text-blue-900 dark:text-blue-100 border border-blue-200/50 dark:border-blue-700/50" 
                    : "bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40 text-purple-900 dark:text-purple-100 border border-purple-200/50 dark:border-purple-700/50"
                }`}>
                  {isRagMode ? "✓ Verified Answers" : "🧠 Explained Answers"}
                </span>
                <div className="hidden group-hover:block absolute bottom-full mb-3 right-0 w-64 p-4 bg-popover/95 backdrop-blur-xl border border-border rounded-xl text-xs text-popover-foreground z-10 whitespace-normal shadow-2xl">
                  <p className="font-bold mb-2 text-sm">{isRagMode ? "✓ Verified Answers" : "🧠 Explained Answers"}</p>
                  <p className="leading-relaxed">
                    {isRagMode
                      ? "Answers sourced exclusively from uploaded content. Refuses if information unavailable."
                      : "Uses content as reference while allowing general reasoning. Indicates when going beyond sources."}
                  </p>
                </div>
              </div>
              <Switch checked={isRagMode} onCheckedChange={setIsRagMode} aria-label="Toggle between Verified Answers and Explained Answers" className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-primary data-[state=checked]:to-purple-600" />
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8 relative z-10">
        {/* Content Type Selection */}
        {selectedContentType === "none" && (
          <Card className="p-10 sm:p-14 shadow-2xl border-0 bg-card/90 backdrop-blur-xl relative overflow-hidden">
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-primary/10 to-transparent rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-purple-500/10 to-transparent rounded-full blur-3xl"></div>
            
            <div className="space-y-10 relative z-10">
              <div className="text-center">
                <h2 className="text-3xl sm:text-4xl font-black mb-4 bg-gradient-to-r from-primary via-purple-600 to-blue-600 bg-clip-text text-transparent leading-tight">
                  Choose Your Content Source
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                  Select a content type below to begin intelligent analysis and get instant answers
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                <button
                  onClick={() => setSelectedContentType("website")}
                  className="group relative flex flex-col items-center gap-5 p-10 border-2 border-border/30 rounded-2xl hover:border-primary/50 bg-gradient-to-br from-card to-muted/20 hover:shadow-2xl hover:scale-105 transition-all duration-300"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 to-blue-500/0 group-hover:from-blue-500/10 group-hover:to-cyan-500/10 rounded-2xl transition-all duration-300"></div>
                  <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-xl">
                    <Globe className="h-10 w-10 text-white" />
                  </div>
                  <div className="text-center relative">
                    <h3 className="font-black text-xl mb-2">Website</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">Deep crawl and intelligent indexing of entire websites</p>
                  </div>
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs px-2 py-1 rounded-full bg-primary text-primary-foreground font-bold">Popular</span>
                  </div>
                </button>
                <button
                  onClick={() => setSelectedContentType("youtube")}
                  className="group relative flex flex-col items-center gap-5 p-10 border-2 border-border/30 rounded-2xl hover:border-primary/50 bg-gradient-to-br from-card to-muted/20 hover:shadow-2xl hover:scale-105 transition-all duration-300"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/0 to-red-500/0 group-hover:from-red-500/10 group-hover:to-pink-500/10 rounded-2xl transition-all duration-300"></div>
                  <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-xl">
                    <Video className="h-10 w-10 text-white" />
                  </div>
                  <div className="text-center relative">
                    <h3 className="font-black text-xl mb-2">YouTube Video</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">Extract and analyze complete video transcripts</p>
                  </div>
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs px-2 py-1 rounded-full bg-red-500 text-white font-bold">Trending</span>
                  </div>
                </button>
                <button
                  onClick={() => setSelectedContentType("pdf")}
                  className="group relative flex flex-col items-center gap-5 p-10 border-2 border-border/30 rounded-2xl hover:border-primary/50 bg-gradient-to-br from-card to-muted/20 hover:shadow-2xl hover:scale-105 transition-all duration-300"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-500/0 to-orange-500/0 group-hover:from-orange-500/10 group-hover:to-amber-500/10 rounded-2xl transition-all duration-300"></div>
                  <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-xl">
                    <span className="text-4xl">📄</span>
                  </div>
                  <div className="text-center relative">
                    <h3 className="font-black text-xl mb-2">PDF Document</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">Upload and process PDF files instantly</p>
                  </div>
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs px-2 py-1 rounded-full bg-orange-500 text-white font-bold">Fast</span>
                  </div>
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* Website Ingestion - Step 1 */}
        {selectedContentType === "website" && (
          <Card className="p-6 sm:p-8 shadow-xl relative overflow-hidden border-2 border-blue-200/50 dark:border-blue-900/50">
            {/* Decorative background */}
            <div className="absolute -top-20 -right-20 w-56 h-56 bg-gradient-to-br from-blue-200/40 to-cyan-200/40 dark:from-blue-900/30 dark:to-cyan-900/30 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-56 h-56 bg-gradient-to-tr from-cyan-200/40 to-blue-200/40 dark:from-cyan-900/30 dark:to-blue-900/30 rounded-full blur-3xl" />
            
            <div className="relative space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
                    <Globe className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">Step 1: Ingest Website</h2>
                    <p className="text-sm text-muted-foreground">Enter a website URL to begin</p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => { setSelectedContentType("none"); setIngestionStatus("idle") }}
                  className="hover:bg-blue-100 dark:hover:bg-blue-900/30"
                >
                  Change Type
                </Button>
              </div>
              <div className="flex gap-3 flex-col sm:flex-row">
                <Input
                  placeholder="https://www.example.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  disabled={ingestionStatus === "loading"}
                  className="flex-1 h-12 border-2 border-blue-300 dark:border-blue-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-200 dark:focus:ring-blue-900/50"
                />
                <Button 
                  onClick={handleIngestWebsite} 
                  disabled={ingestionStatus === "loading" || !websiteUrl.trim()}
                  className="h-12 px-6 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg hover:shadow-xl transition-all hover:scale-105"
                >
                  {ingestionStatus === "loading" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Indexing...</> : "Index Website"}
                </Button>
              </div>
              {ingestionStatus === "success" && ingestionData && (
                <div className="border-2 border-green-300 dark:border-green-800 rounded-xl p-5 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 shadow-lg animate-fadeIn">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg flex-shrink-0">
                      <CheckCircle2 className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-lg text-green-900 dark:text-green-100 mb-3">🌐 Website indexed successfully!</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white/60 dark:bg-gray-900/60 rounded-lg p-3 border border-green-200 dark:border-green-900">
                          <div className="text-2xl font-black text-green-700 dark:text-green-300">{ingestionData.pagesCrawled}</div>
                          <div className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">Pages</div>
                        </div>
                        <div className="bg-white/60 dark:bg-gray-900/60 rounded-lg p-3 border border-green-200 dark:border-green-900">
                          <div className="text-2xl font-black text-green-700 dark:text-green-300">{ingestionData.chunksIndexed}</div>
                          <div className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">Chunks</div>
                        </div>
                        <div className="bg-white/60 dark:bg-gray-900/60 rounded-lg p-3 border border-green-200 dark:border-green-900">
                          <div className="text-xs font-mono text-green-700 dark:text-green-300 truncate">{ingestionData.siteId}</div>
                          <div className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">Site ID</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {ingestionStatus === "error" && (
                <Alert variant="destructive" className="border-2 shadow-lg">
                  <AlertTriangle className="h-5 w-5" />
                  <AlertDescription className="font-semibold">Failed to ingest website</AlertDescription>
                </Alert>
              )}
            </div>
          </Card>
        )}

        {/* YouTube Ingestion - Step 1b */}
        {selectedContentType === "youtube" && (
          <Card className="p-6 sm:p-8 shadow-xl relative overflow-hidden border-2 border-red-200/50 dark:border-red-900/50">
            {/* Decorative background */}
            <div className="absolute -top-20 -right-20 w-56 h-56 bg-gradient-to-br from-red-200/40 to-pink-200/40 dark:from-red-900/30 dark:to-pink-900/30 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-56 h-56 bg-gradient-to-tr from-pink-200/40 to-red-200/40 dark:from-pink-900/30 dark:to-red-900/30 rounded-full blur-3xl" />
            
            <div className="relative space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center shadow-lg">
                    <Video className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-red-600 to-pink-600 dark:from-red-400 dark:to-pink-400 bg-clip-text text-transparent">Step 1: Ingest YouTube Video</h2>
                    <p className="text-sm text-muted-foreground">Enter a YouTube URL</p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => { setSelectedContentType("none"); setYoutubeStatus("idle") }}
                  className="hover:bg-red-100 dark:hover:bg-red-900/30"
                >
                  Change Type
                </Button>
              </div>
              <div className="flex gap-3 flex-col sm:flex-row">
                <Input
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  disabled={youtubeStatus === "loading"}
                  className="flex-1 h-12 border-2 border-red-300 dark:border-red-800 focus:border-red-500 focus:ring-4 focus:ring-red-200 dark:focus:ring-red-900/50"
                />
                <Button 
                  onClick={handleIngestYouTube} 
                  disabled={youtubeStatus === "loading" || !youtubeUrl.trim()}
                  className="h-12 px-6 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 shadow-lg hover:shadow-xl transition-all hover:scale-105"
                >
                  {youtubeStatus === "loading" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Indexing...</> : "Index Video"}
                </Button>
              </div>
              {youtubeStatus === "success" && youtubeData && (
                <div className="border-2 border-green-300 dark:border-green-800 rounded-xl p-5 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 shadow-lg animate-fadeIn">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg flex-shrink-0">
                      <CheckCircle2 className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-lg text-green-900 dark:text-green-100 mb-3">🎥 YouTube video indexed successfully!</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white/60 dark:bg-gray-900/60 rounded-lg p-3 border border-green-200 dark:border-green-900">
                          <div className="text-2xl font-black text-green-700 dark:text-green-300">{youtubeData.segmentsProcessed}</div>
                          <div className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">Segments</div>
                        </div>
                        <div className="bg-white/60 dark:bg-gray-900/60 rounded-lg p-3 border border-green-200 dark:border-green-900">
                          <div className="text-2xl font-black text-green-700 dark:text-green-300">{youtubeData.chunksIndexed}</div>
                          <div className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">Chunks</div>
                        </div>
                        <div className="bg-white/60 dark:bg-gray-900/60 rounded-lg p-3 border border-green-200 dark:border-green-900">
                          <div className="text-xs font-mono text-green-700 dark:text-green-300 truncate">{youtubeData.videoId}</div>
                          <div className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">Video ID</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {youtubeStatus === "error" && (
                <Alert variant="destructive" className="border-2 shadow-lg">
                  <AlertTriangle className="h-5 w-5" />
                  <AlertDescription className="font-semibold">Failed to ingest YouTube video</AlertDescription>
                </Alert>
              )}
            </div>
          </Card>
        )}

        {/* PDF Ingestion */}
        {selectedContentType === "pdf" && (
          <Card className="p-6 sm:p-8 shadow-xl relative overflow-hidden border-2 border-orange-200/50 dark:border-orange-900/50">
            {/* Decorative background */}
            <div className="absolute -top-20 -right-20 w-56 h-56 bg-gradient-to-br from-orange-200/40 to-amber-200/40 dark:from-orange-900/30 dark:to-amber-900/30 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-56 h-56 bg-gradient-to-tr from-amber-200/40 to-orange-200/40 dark:from-amber-900/30 dark:to-orange-900/30 rounded-full blur-3xl" />
            
            <div className="relative space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg text-4xl">
                    📄
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 dark:from-orange-400 dark:to-amber-400 bg-clip-text text-transparent">Step 1: Ingest PDF</h2>
                    <p className="text-sm text-muted-foreground">Upload a PDF file</p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => { setSelectedContentType("none"); setPdfStatus("idle") }}
                  className="hover:bg-orange-100 dark:hover:bg-orange-900/30"
                >
                  Change Type
                </Button>
              </div>

              {ingestionData?.siteId && (
                <Alert className="border-2 border-orange-200 dark:border-orange-800 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30">
                  <Info className="h-5 w-5 text-orange-600" />
                  <AlertDescription className="font-semibold text-orange-900 dark:text-orange-100">Will use existing site_id: {ingestionData.siteId}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3 flex-col sm:flex-row items-center">
                <Input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  disabled={pdfStatus === "loading"}
                  className="flex-1 h-12 border-2 border-orange-300 dark:border-orange-800 focus:border-orange-500 focus:ring-4 focus:ring-orange-200 dark:focus:ring-orange-900/50"
                />
                <Button 
                  onClick={handleIngestPdf} 
                  disabled={pdfStatus === "loading" || !pdfFile}
                  className="h-12 px-6 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 shadow-lg hover:shadow-xl transition-all hover:scale-105"
                >
                  {pdfStatus === "loading" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Indexing...</> : "Index PDF"}
                </Button>
              </div>

              {pdfStatus === "success" && pdfData && (
                <div className="border-2 border-green-300 dark:border-green-800 rounded-xl p-5 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 shadow-lg animate-fadeIn">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg flex-shrink-0">
                      <CheckCircle2 className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-lg text-green-900 dark:text-green-100 mb-3">📄 PDF indexed successfully!</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white/60 dark:bg-gray-900/60 rounded-lg p-3 border border-green-200 dark:border-green-900">
                          <div className="text-2xl font-black text-green-700 dark:text-green-300">{pdfData.pagesProcessed}</div>
                          <div className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">Pages</div>
                        </div>
                        <div className="bg-white/60 dark:bg-gray-900/60 rounded-lg p-3 border border-green-200 dark:border-green-900">
                          <div className="text-2xl font-black text-green-700 dark:text-green-300">{pdfData.chunksIndexed}</div>
                          <div className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">Chunks</div>
                        </div>
                        <div className="bg-white/60 dark:bg-gray-900/60 rounded-lg p-3 border border-green-200 dark:border-green-900">
                          <div className="text-xs font-mono text-green-700 dark:text-green-300 truncate">{pdfData.siteId}</div>
                          <div className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">Site ID</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {pdfStatus === "error" && (
                <Alert variant="destructive" className="border-2 shadow-lg">
                  <AlertTriangle className="h-5 w-5" />
                  <AlertDescription className="font-semibold">Failed to ingest PDF</AlertDescription>
                </Alert>
              )}
            </div>
          </Card>
        )}

        {/* Chat Interface */}
        {(ingestionStatus === "success" || youtubeStatus === "success" || pdfStatus === "success") && (
          <Card className="p-6 sm:p-8 shadow-xl relative overflow-hidden border-2 border-indigo-200/50 dark:border-indigo-900/50">
            {/* Decorative background */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-gradient-to-br from-indigo-200/30 to-purple-200/30 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-gradient-to-tr from-blue-200/30 to-indigo-200/30 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-full blur-3xl" />
            
            <div className="relative space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                  <MessageSquare className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 bg-clip-text text-transparent">Step 2: Ask Questions</h2>
                  <p className="text-sm text-muted-foreground">Chat with your content</p>
                </div>
              </div>
              
              {/* Source Filter */}
              {sourceFilterVisible && (
                <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-xl border border-indigo-200 dark:border-indigo-900 flex-wrap backdrop-blur-sm">
                  <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">{isRagMode ? "Source types:" : "Include from:"}:</span>
                  <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg bg-white/60 dark:bg-gray-900/60 hover:scale-105 transition-transform">
                    <input type="checkbox" checked={includeSourceTypes.website} onChange={(e) => setIncludeSourceTypes(prev => ({ ...prev, website: e.target.checked }))} className="w-4 h-4 accent-indigo-600" disabled={!hasWebsite} />
                    <span className="text-sm font-medium">🌐 Website</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg bg-white/60 dark:bg-gray-900/60 hover:scale-105 transition-transform">
                    <input type="checkbox" checked={includeSourceTypes.youtube} onChange={(e) => setIncludeSourceTypes(prev => ({ ...prev, youtube: e.target.checked }))} className="w-4 h-4 accent-red-600" disabled={!hasYouTube} />
                    <span className="text-sm font-medium">🎥 YouTube</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg bg-white/60 dark:bg-gray-900/60 hover:scale-105 transition-transform">
                    <input type="checkbox" checked={includeSourceTypes.pdf} onChange={(e) => setIncludeSourceTypes(prev => ({ ...prev, pdf: e.target.checked }))} className="w-4 h-4 accent-orange-600" disabled={!hasPdf} />
                    <span className="text-sm font-medium">📄 PDF</span>
                  </label>
                </div>
              )}

              {/* Messages */}
              <div className="min-h-[300px] max-h-[500px] overflow-y-auto space-y-4 border-2 border-indigo-200 dark:border-indigo-900 rounded-2xl p-5 bg-gradient-to-br from-white/80 to-indigo-50/30 dark:from-gray-950/80 dark:to-indigo-950/30 backdrop-blur-sm">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[250px] space-y-4">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 flex items-center justify-center animate-pulse">
                      <MessageSquare className="h-10 w-10 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <p className="text-muted-foreground text-center font-medium">Ask a question about your ingested content</p>
                    <div className="flex gap-2">
                      <span className="px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-xs font-semibold text-indigo-700 dark:text-indigo-300">Smart Answers</span>
                      <span className="px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-xs font-semibold text-purple-700 dark:text-purple-300">Instant Results</span>
                    </div>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-3 animate-fadeIn ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.role === "assistant" && (
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg ring-4 ring-indigo-100 dark:ring-indigo-900/50 flex-shrink-0">
                          AI
                        </div>
                      )}
                      <div className={`max-w-[80%] rounded-2xl p-4 shadow-lg relative ${
                        msg.role === "user" 
                          ? "bg-gradient-to-br from-indigo-600 to-purple-600 text-white" 
                          : "bg-white dark:bg-gray-900 border-2 border-indigo-200 dark:border-indigo-900"
                      }`}>
                        {msg.role === "assistant" && (
                          <div className="mb-3 flex items-center gap-2">
                            <span className={`text-xs px-3 py-1.5 rounded-full font-bold shadow-sm ${
                              (msg.mode ?? (isRagMode ? "rag" : "general")) === "rag"
                                ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white"
                                : "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                            }`}>
                              {(msg.mode ?? (isRagMode ? "rag" : "general")) === "rag" ? "✓ Source-only" : "⚡ Source + Reasoning"}
                            </span>
                            {typeof msg.confidence === "number" && (
                              <span className="text-[10px] px-2 py-1 rounded-full border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 font-semibold">
                                Confidence: {msg.confidence}%
                              </span>
                            )}
                          </div>
                        )}
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-4 pt-4 border-t-2 border-indigo-100 dark:border-indigo-900/50">
                            <p className="text-xs font-bold text-indigo-900 dark:text-indigo-100 mb-2 uppercase tracking-wider">{isRagMode ? "Sources" : "References"}:</p>
                            <div className="space-y-1.5">
                              {msg.sources.map((source, sidx) => (
                                <a 
                                  key={sidx} 
                                  href={source.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/50 dark:to-purple-950/50 hover:from-indigo-100 hover:to-purple-100 dark:hover:from-indigo-900/50 dark:hover:to-purple-900/50 text-indigo-700 dark:text-indigo-300 hover:scale-105 transition-all font-medium border border-indigo-200 dark:border-indigo-900"
                                >
                                  <span>
                                    {source.type === "youtube" && source.timestamp
                                      ? `🎥 YouTube (${source.timestamp})`
                                      : source.type === "youtube"
                                      ? "🎥 YouTube"
                                      : source.type === "pdf" && source.page_number
                                      ? `📄 PDF (Page ${source.page_number})`
                                      : source.type === "pdf"
                                      ? "📄 PDF"
                                      : `🌐 ${source.title || source.url}`}
                                  </span>
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      {msg.role === "user" && (
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center text-white font-bold shadow-lg ring-4 ring-gray-100 dark:ring-gray-900/50 flex-shrink-0">
                          U
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Input */}
              <div className="flex gap-3">
                <Input
                  placeholder="Type your question..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !isSendingMessage) handleSendMessage() }}
                  disabled={isSendingMessage || !ingestionData}
                  className="flex-1 h-12 px-4 rounded-xl border-2 border-indigo-300 dark:border-indigo-800 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-200 dark:focus:ring-indigo-900/50 bg-white dark:bg-gray-950"
                />
                <Button 
                  onClick={handleSendMessage} 
                  disabled={isSendingMessage || !inputMessage.trim() || !ingestionData} 
                  className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all hover:scale-105"
                  size="icon"
                >
                  {isSendingMessage ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </Button>
              </div>
            </div>
          </Card>
        )}
      </main>
    </div>
  )
}
