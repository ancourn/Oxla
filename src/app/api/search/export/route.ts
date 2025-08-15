import { NextRequest, NextResponse } from 'next/server'
import jsPDF from 'jspdf'

export async function POST(request: NextRequest) {
  try {
    const { results, format, query } = await request.json()
    
    if (!results || !format) {
      return NextResponse.json({ error: 'Results and format are required' }, { status: 400 })
    }

    if (!['csv', 'json', 'html', 'pdf'].includes(format)) {
      return NextResponse.json({ error: 'Invalid format. Supported formats: csv, json, html, pdf' }, { status: 400 })
    }

    let content: string
    let contentType: string
    let filename: string

    switch (format) {
      case 'csv':
        content = generateCSV(results)
        contentType = 'text/csv'
        filename = `search-results-${query || 'export'}.csv`
        break
      case 'json':
        content = generateJSON(results)
        contentType = 'application/json'
        filename = `search-results-${query || 'export'}.json`
        break
      case 'html':
        content = generateHTML(results, query)
        contentType = 'text/html'
        filename = `search-results-${query || 'export'}.html`
        break
      case 'pdf':
        content = generatePDF(results, query)
        contentType = 'application/pdf'
        filename = `search-results-${query || 'export'}.pdf`
        break
      default:
        return NextResponse.json({ error: 'Unsupported format' }, { status: 400 })
    }

    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Failed to export results' }, { status: 500 })
  }
}

function generateCSV(results: any[]): string {
  if (!results || results.length === 0) {
    return 'No results found'
  }

  const headers = ['Title', 'URL', 'Snippet', 'Host', 'Date']
  const csvRows = [headers.join(',')]

  results.forEach((result) => {
    const row = [
      `"${(result.name || '').replace(/"/g, '""')}"`,
      `"${(result.url || '').replace(/"/g, '""')}"`,
      `"${(result.snippet || '').replace(/"/g, '""')}"`,
      `"${(result.host_name || '').replace(/"/g, '""')}"`,
      `"${(result.date || '').replace(/"/g, '""')}"`
    ]
    csvRows.push(row.join(','))
  })

  return csvRows.join('\n')
}

function generateJSON(results: any[]): string {
  return JSON.stringify(results, null, 2)
}

function generateHTML(results: any[], query?: string): string {
  const timestamp = new Date().toLocaleString()
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Search Results Export</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9fafb;
        }
        .header {
            background: white;
            padding: 30px;
            border-radius: 8px;
            margin-bottom: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header h1 {
            margin: 0 0 10px 0;
            color: #1f2937;
        }
        .meta {
            color: #6b7280;
            font-size: 14px;
        }
        .result {
            background: white;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .result h3 {
            margin: 0 0 10px 0;
            color: #1f2937;
        }
        .result a {
            color: #3b82f6;
            text-decoration: none;
            font-size: 14px;
        }
        .result a:hover {
            text-decoration: underline;
        }
        .snippet {
            margin: 10px 0;
            color: #4b5563;
        }
        .meta-info {
            display: flex;
            gap: 15px;
            font-size: 12px;
            color: #6b7280;
        }
        .no-results {
            text-align: center;
            padding: 40px;
            color: #6b7280;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Search Results Export</h1>
        <div class="meta">
            <p><strong>Query:</strong> ${query || 'N/A'}</p>
            <p><strong>Generated:</strong> ${timestamp}</p>
            <p><strong>Total Results:</strong> ${results?.length || 0}</p>
        </div>
    </div>
    
    ${results && results.length > 0 ? 
      results.map((result, index) => `
        <div class="result">
            <h3>${result.name || 'Untitled'}</h3>
            <a href="${result.url || '#'}" target="_blank">${result.url || 'No URL'}</a>
            <div class="snippet">${result.snippet || 'No snippet available'}</div>
            <div class="meta-info">
                <span><strong>Host:</strong> ${result.host_name || 'N/A'}</span>
                <span><strong>Date:</strong> ${result.date || 'N/A'}</span>
            </div>
        </div>
      `).join('') : 
      '<div class="no-results">No results found</div>'
    }
</body>
</html>
  `
}

function generatePDF(results: any[], query?: string): string {
  // Create a new PDF document
  const doc = new jsPDF()
  
  // Set up the document
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  let yPosition = margin

  // Add title
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('Search Results Export', margin, yPosition)
  yPosition += 15

  // Add metadata
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(`Query: ${query || 'N/A'}`, margin, yPosition)
  yPosition += 8
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, yPosition)
  yPosition += 8
  doc.text(`Total Results: ${results?.length || 0}`, margin, yPosition)
  yPosition += 15

  // Add results
  if (results && results.length > 0) {
    results.forEach((result, index) => {
      // Check if we need a new page
      if (yPosition > pageHeight - 60) {
        doc.addPage()
        yPosition = margin
      }

      // Add result title
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      const title = result.name || 'Untitled'
      const splitTitle = doc.splitTextToSize(`${index + 1}. ${title}`, pageWidth - 2 * margin)
      doc.text(splitTitle, margin, yPosition)
      yPosition += splitTitle.length * 5 + 5

      // Add URL
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(0, 0, 255)
      const url = result.url || 'No URL'
      const splitUrl = doc.splitTextToSize(url, pageWidth - 2 * margin)
      doc.text(splitUrl, margin, yPosition)
      yPosition += splitUrl.length * 4 + 3
      doc.setTextColor(0, 0, 0)

      // Add snippet
      doc.setFontSize(10)
      const snippet = result.snippet || 'No snippet available'
      const splitSnippet = doc.splitTextToSize(snippet, pageWidth - 2 * margin)
      doc.text(splitSnippet, margin, yPosition)
      yPosition += splitSnippet.length * 4 + 5

      // Add meta info
      doc.setFontSize(8)
      doc.setTextColor(100, 100, 100)
      const metaInfo = `Host: ${result.host_name || 'N/A'} | Date: ${result.date || 'N/A'}`
      doc.text(metaInfo, margin, yPosition)
      yPosition += 10
      doc.setTextColor(0, 0, 0)

      // Add separator
      doc.setDrawColor(200, 200, 200)
      doc.line(margin, yPosition, pageWidth - margin, yPosition)
      yPosition += 10
    })
  } else {
    doc.setFontSize(12)
    doc.text('No results found', margin, yPosition)
  }

  // Return the PDF as a base64 string
  return doc.output('dataurlstring').split(',')[1]
}