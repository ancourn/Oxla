'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { 
  Search, 
  Sparkles, 
  Clock, 
  TrendingUp, 
  FileText,
  ExternalLink,
  Copy,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  Filter,
  Download,
  Calendar,
  Globe,
  Star,
  Tag
} from 'lucide-react'

interface SearchResult {
  url: string
  name: string
  snippet: string
  host_name: string
  rank: number
  date: string
  favicon: string
  type?: 'article' | 'blog' | 'news' | 'documentation' | 'forum' | 'video'
  relevance?: number
  tags?: string[]
}

interface SearchHistoryItem {
  id: string
  query: string
  results: string
  createdAt: Date
  tags?: string[]
}

interface SearchFilters {
  timeRange: 'all' | 'day' | 'week' | 'month' | 'year'
  type: string[]
  relevance: number
  sortBy: 'relevance' | 'date' | 'rank'
  tags: string[]
}

interface AISearchProps {
  user: {
    id: string
    name?: string
  }
}

export function AISearch({ user }: AISearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [filteredResults, setFilteredResults] = useState<SearchResult[]>([])
  const [aiInsights, setAiInsights] = useState<string>('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([])
  const [activeTab, setActiveTab] = useState('search')
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<SearchFilters>({
    timeRange: 'all',
    type: [],
    relevance: 0,
    sortBy: 'relevance',
    tags: []
  })
  const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'pdf'>('csv')
  const resultsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Load search history
    loadSearchHistory()
  }, [])

  useEffect(() => {
    // Auto-scroll to results when they arrive
    resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [results])

  useEffect(() => {
    // Apply filters when results or filters change
    applyFilters()
  }, [results, filters])

  const applyFilters = () => {
    let filtered = [...results]

    // Time range filter
    if (filters.timeRange !== 'all') {
      const now = new Date()
      const cutoffDate = new Date()
      
      switch (filters.timeRange) {
        case 'day':
          cutoffDate.setDate(now.getDate() - 1)
          break
        case 'week':
          cutoffDate.setDate(now.getDate() - 7)
          break
        case 'month':
          cutoffDate.setMonth(now.getMonth() - 1)
          break
        case 'year':
          cutoffDate.setFullYear(now.getFullYear() - 1)
          break
      }
      
      filtered = filtered.filter(result => new Date(result.date) >= cutoffDate)
    }

    // Type filter
    if (filters.type.length > 0) {
      filtered = filtered.filter(result => 
        result.type && filters.type.includes(result.type)
      )
    }

    // Relevance filter
    if (filters.relevance > 0) {
      filtered = filtered.filter(result => 
        result.relevance && result.relevance >= filters.relevance
      )
    }

    // Tags filter
    if (filters.tags.length > 0) {
      filtered = filtered.filter(result =>
        result.tags && filters.tags.some(tag => result.tags?.includes(tag))
      )
    }

    // Sort
    switch (filters.sortBy) {
      case 'relevance':
        filtered.sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
        break
      case 'date':
        filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        break
      case 'rank':
        filtered.sort((a, b) => a.rank - b.rank)
        break
    }

    setFilteredResults(filtered)
  }

  const loadSearchHistory = async () => {
    try {
      const response = await fetch('/api/search/history', {
        headers: {
          'Authorization': `Bearer ${user.id}`
        }
      })
      
      if (response.ok) {
        const history = await response.json()
        setSearchHistory(history)
      }
    } catch (error) {
      console.error('Failed to load search history:', error)
    }
  }

  const handleSearch = async () => {
    if (!query.trim()) return

    setIsSearching(true)
    setResults([])
    setAiInsights('')

    try {
      // Perform web search
      const searchResponse = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.id}`
        },
        body: JSON.stringify({ query: query.trim() })
      })

      if (searchResponse.ok) {
        const searchData = await searchResponse.json()
        setResults(searchData.results || [])
        
        // Generate AI insights
        if (searchData.results && searchData.results.length > 0) {
          await generateAIInsights(query.trim(), searchData.results)
        }

        // Save to search history
        await saveToSearchHistory(query.trim(), searchData.results)
      }
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setIsSearching(false)
    }
  }

  const generateAIInsights = async (query: string, results: SearchResult[]) => {
    try {
      const response = await fetch('/api/search/insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.id}`
        },
        body: JSON.stringify({ query, results })
      })

      if (response.ok) {
        const data = await response.json()
        setAiInsights(data.insights || '')
      }
    } catch (error) {
      console.error('Failed to generate AI insights:', error)
    }
  }

  const saveToSearchHistory = async (query: string, results: SearchResult[]) => {
    try {
      await fetch('/api/search/history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.id}`
        },
        body: JSON.stringify({ query, results })
      })

      // Reload history
      loadSearchHistory()
    } catch (error) {
      console.error('Failed to save search history:', error)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSearch()
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const handleFeedback = async (resultId: string, isPositive: boolean) => {
    try {
      await fetch('/api/search/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.id}`
        },
        body: JSON.stringify({ resultId, isPositive })
      })
    } catch (error) {
      console.error('Failed to save feedback:', error)
    }
  }

  const clearHistory = async () => {
    try {
      await fetch('/api/search/history', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${user.id}`
        }
      })
      setSearchHistory([])
    } catch (error) {
      console.error('Failed to clear search history:', error)
    }
  }

  const toggleResultSelection = (url: string) => {
    const newSelection = new Set(selectedResults)
    if (newSelection.has(url)) {
      newSelection.delete(url)
    } else {
      newSelection.add(url)
    }
    setSelectedResults(newSelection)
  }

  const selectAllResults = () => {
    if (selectedResults.size === filteredResults.length) {
      setSelectedResults(new Set())
    } else {
      setSelectedResults(new Set(filteredResults.map(r => r.url)))
    }
  }

  const exportResults = async () => {
    const resultsToExport = selectedResults.size > 0 
      ? filteredResults.filter(r => selectedResults.has(r.url))
      : filteredResults

    if (resultsToExport.length === 0) {
      alert('No results to export')
      return
    }

    try {
      let content: string
      let filename: string
      let mimeType: string

      switch (exportFormat) {
        case 'csv':
          content = convertToCSV(resultsToExport)
          filename = `search-results-${Date.now()}.csv`
          mimeType = 'text/csv'
          break
        case 'json':
          content = JSON.stringify(resultsToExport, null, 2)
          filename = `search-results-${Date.now()}.json`
          mimeType = 'application/json'
          break
        case 'pdf':
          await generatePDFReport(resultsToExport, query, aiInsights)
          return // generatePDFReport handles the download directly
        default:
          throw new Error('Unsupported export format')
      }

      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Export failed:', error)
      alert('Failed to export results')
    }
  }

  const convertToCSV = (results: SearchResult[]): string => {
    const headers = ['Title', 'URL', 'Snippet', 'Host', 'Date', 'Rank', 'Type', 'Relevance', 'Tags']
    const rows = results.map(result => [
      result.name,
      result.url,
      result.snippet,
      result.host_name,
      result.date,
      result.rank.toString(),
      result.type || '',
      (result.relevance || 0).toString(),
      result.tags?.join('; ') || ''
    ])

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n')

    return csvContent
  }

  const generateHTMLReport = (results: SearchResult[], query: string, insights: string): string => {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Search Results Report - ${query}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .query { font-size: 24px; font-weight: bold; color: #333; }
        .meta { color: #666; margin-top: 10px; }
        .insights { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .result { margin-bottom: 30px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
        .result-title { font-size: 18px; font-weight: bold; color: #0066cc; margin-bottom: 10px; }
        .result-url { color: #0066cc; text-decoration: none; font-size: 14px; }
        .result-snippet { color: #333; margin: 10px 0; line-height: 1.5; }
        .result-meta { color: #666; font-size: 12px; }
        .tags { margin-top: 10px; }
        .tag { background: #e0e0e0; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-right: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="query">Search Results for: ${query}</div>
        <div class="meta">Generated on ${new Date().toLocaleString()} | ${results.length} results</div>
    </div>
    
    ${insights ? `<div class="insights">
        <h3>AI Insights</h3>
        <p>${insights}</p>
    </div>` : ''}
    
    ${results.map((result, index) => `
        <div class="result">
            <div class="result-title">
                <a href="${result.url}" class="result-url">${result.name}</a>
            </div>
            <div class="result-snippet">${result.snippet}</div>
            <div class="result-meta">
                ${result.host_name} • ${new Date(result.date).toLocaleDateString()} • Rank #${result.rank}
                ${result.type ? ` • Type: ${result.type}` : ''}
                ${result.relevance ? ` • Relevance: ${result.relevance}` : ''}
            </div>
            ${result.tags && result.tags.length > 0 ? `
                <div class="tags">
                    ${result.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
            ` : ''}
        </div>
    `).join('')}
</body>
</html>
    `
  }

  const generatePDFReport = async (results: SearchResult[], query: string, insights: string) => {
    try {
      // Create HTML content for the PDF
      const htmlContent = generateHTMLReport(results, query, insights)
      
      // Create a temporary div to render the HTML
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = htmlContent
      tempDiv.style.width = '210mm' // A4 width
      tempDiv.style.padding = '20mm'
      tempDiv.style.fontFamily = 'Arial, sans-serif'
      tempDiv.style.fontSize = '12px'
      tempDiv.style.lineHeight = '1.5'
      tempDiv.style.position = 'absolute'
      tempDiv.style.left = '-9999px'
      document.body.appendChild(tempDiv)

      // Convert the HTML to canvas
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        width: 794, // A4 width in pixels at 96 DPI
        windowWidth: 794
      })

      // Remove the temporary div
      document.body.removeChild(tempDiv)

      // Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4')
      const imgData = canvas.toDataURL('image/png')
      
      // Calculate dimensions to fit the page
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = canvas.width
      const imgHeight = canvas.height
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight)
      const imgX = (pdfWidth - imgWidth * ratio) / 2
      const imgY = 10

      // Add the image to PDF
      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio)

      // Save the PDF
      const filename = `search-results-${Date.now()}.pdf`
      pdf.save(filename)
      
    } catch (error) {
      console.error('PDF generation failed:', error)
      alert('Failed to generate PDF. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-6 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-primary">AI-Powered Search</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl">
            Intelligent Search & Insights
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-[600px] mx-auto">
            Search the web with AI-powered insights and get intelligent summaries of your results.
          </p>
        </div>

        {/* Search Interface */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search
            </CardTitle>
            <CardDescription>
              Enter your query and let AI help you find the most relevant information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="What would you like to search for?"
                    className="pr-12"
                    disabled={isSearching}
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                <Button 
                  onClick={handleSearch} 
                  disabled={!query.trim() || isSearching}
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </Button>
              </div>
              
              {/* Filters and Export */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Popover open={showFilters} onOpenChange={setShowFilters}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Filter className="h-4 w-4 mr-2" />
                        Filters
                        {(filters.type.length > 0 || filters.tags.length > 0 || filters.timeRange !== 'all' || filters.relevance > 0) && (
                          <Badge variant="secondary" className="ml-2">
                            Active
                          </Badge>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                      <div className="space-y-4">
                        <div>
                          <Label className="text-sm font-medium">Time Range</Label>
                          <Select value={filters.timeRange} onValueChange={(value: any) => setFilters({...filters, timeRange: value})}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Time</SelectItem>
                              <SelectItem value="day">Last 24 Hours</SelectItem>
                              <SelectItem value="week">Last Week</SelectItem>
                              <SelectItem value="month">Last Month</SelectItem>
                              <SelectItem value="year">Last Year</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div>
                          <Label className="text-sm font-medium">Content Type</Label>
                          <div className="space-y-2 mt-2">
                            {['article', 'blog', 'news', 'documentation', 'forum', 'video'].map(type => (
                              <div key={type} className="flex items-center space-x-2">
                                <Checkbox 
                                  id={type}
                                  checked={filters.type.includes(type)}
                                  onCheckedChange={(checked) => {
                                    const newTypes = checked 
                                      ? [...filters.type, type]
                                      : filters.type.filter(t => t !== type)
                                    setFilters({...filters, type: newTypes})
                                  }}
                                />
                                <Label htmlFor={type} className="text-sm capitalize">{type}</Label>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <div>
                          <Label className="text-sm font-medium">Sort By</Label>
                          <Select value={filters.sortBy} onValueChange={(value: any) => setFilters({...filters, sortBy: value})}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="relevance">Relevance</SelectItem>
                              <SelectItem value="date">Date</SelectItem>
                              <SelectItem value="rank">Rank</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div>
                          <Label className="text-sm font-medium">Minimum Relevance: {filters.relevance}</Label>
                          <input 
                            type="range" 
                            min="0" 
                            max="10" 
                            value={filters.relevance}
                            onChange={(e) => setFilters({...filters, relevance: parseInt(e.target.value)})}
                            className="w-full"
                          />
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                
                {filteredResults.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Select value={exportFormat} onValueChange={(value: any) => setExportFormat(value)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="csv">CSV</SelectItem>
                        <SelectItem value="json">JSON</SelectItem>
                        <SelectItem value="pdf">PDF</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={exportResults}>
                      <Download className="h-4 w-4 mr-2" />
                      Export ({selectedResults.size > 0 ? selectedResults.size : 'All'})
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Results {results.length > 0 && `(${results.length})`}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              History {searchHistory.length > 0 && `(${searchHistory.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-6">
            {/* AI Insights */}
            {aiInsights && (
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-primary">
                    <Sparkles className="h-5 w-5" />
                    AI Insights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none">
                    <p className="text-sm leading-relaxed">{aiInsights}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Search Results */}
            {filteredResults.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold">Search Results</h3>
                    <Badge variant="secondary">
                      {filteredResults.length} of {results.length} results
                    </Badge>
                    {results.length !== filteredResults.length && (
                      <Badge variant="outline">
                        Filters applied
                      </Badge>
                    )}
                  </div>
                  
                  {filteredResults.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="select-all"
                        checked={selectedResults.size === filteredResults.length}
                        onCheckedChange={selectAllResults}
                      />
                      <Label htmlFor="select-all" className="text-sm">Select all</Label>
                    </div>
                  )}
                </div>
                
                <div className="space-y-4">
                  {filteredResults.map((result, index) => (
                    <Card key={index} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedResults.has(result.url)}
                            onCheckedChange={() => toggleResultSelection(result.url)}
                            className="mt-1"
                          />
                          
                          {result.favicon && (
                            <img 
                              src={result.favicon} 
                              alt="" 
                              className="w-5 h-5 mt-1 flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                              }}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <a 
                                href={result.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline"
                              >
                                {result.name}
                                <ExternalLink className="inline ml-1 h-3 w-3" />
                              </a>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(result.url)}
                                  className="h-6 w-6 p-0"
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleFeedback(result.url, true)}
                                  className="h-6 w-6 p-0 text-green-600"
                                >
                                  <ThumbsUp className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleFeedback(result.url, false)}
                                  className="h-6 w-6 p-0 text-red-600"
                                >
                                  <ThumbsDown className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            
                            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                              {result.snippet}
                            </p>
                            
                            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                              <span>{result.host_name}</span>
                              <span>•</span>
                              <span>{formatDate(result.date)}</span>
                              <span>•</span>
                              <Badge variant="outline" className="text-xs">
                                Rank #{result.rank}
                              </Badge>
                              {result.type && (
                                <>
                                  <span>•</span>
                                  <Badge variant="secondary" className="text-xs capitalize">
                                    {result.type}
                                  </Badge>
                                </>
                              )}
                              {result.relevance && (
                                <>
                                  <span>•</span>
                                  <Badge variant="outline" className="text-xs">
                                    <Star className="h-3 w-3 inline mr-1" />
                                    {result.relevance}/10
                                  </Badge>
                                </>
                              )}
                            </div>
                            
                            {result.tags && result.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {result.tags.map((tag, tagIndex) => (
                                  <Badge key={tagIndex} variant="outline" className="text-xs">
                                    <Tag className="h-3 w-3 inline mr-1" />
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : results.length > 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Filter className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Results Match Your Filters</h3>
                  <p className="text-muted-foreground mb-4">
                    Try adjusting your filter criteria to see more results.
                  </p>
                  <Button variant="outline" onClick={() => setFilters({
                    timeRange: 'all',
                    type: [],
                    relevance: 0,
                    sortBy: 'relevance',
                    tags: []
                  })}>
                    Clear Filters
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Results Yet</h3>
                  <p className="text-muted-foreground">
                    Enter a search query above to get started with AI-powered search.
                  </p>
                </CardContent>
              </Card>
            )}
            
            <div ref={resultsEndRef} />
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Search History</h3>
              {searchHistory.length > 0 && (
                <Button variant="outline" size="sm" onClick={clearHistory}>
                  Clear History
                </Button>
              )}
            </div>

            {searchHistory.length > 0 ? (
              <ScrollArea className="h-[600px]">
                <div className="space-y-3">
                  {searchHistory.map((item) => (
                    <Card key={item.id} className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <h4 className="font-medium truncate">{item.query}</h4>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {new Date(item.createdAt).toLocaleString()}
                            </p>
                            {item.results && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {JSON.parse(item.results).length} results
                              </p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setQuery(item.query)
                              setActiveTab('search')
                            }}
                          >
                            <Search className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Search History</h3>
                  <p className="text-muted-foreground">
                    Your search history will appear here once you start searching.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}