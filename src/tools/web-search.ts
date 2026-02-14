/**
 * Crux — web_search tool
 *
 * Search the web using DuckDuckGo's HTML endpoint.
 * Zero dependencies — just fetch + regex parsing.
 */

import { createTool } from '@elfenlabs/cog'

/** A single search result */
interface SearchResult {
  title: string
  url: string
  snippet: string
}

/**
 * Extract the actual URL from a DuckDuckGo redirect link.
 * DDG wraps results like: //duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com&...
 */
function extractUrl(ddgHref: string): string {
  const match = ddgHref.match(/uddg=([^&]+)/)
  if (match) {
    return decodeURIComponent(match[1])
  }
  // Fallback: if it's already a direct URL
  if (ddgHref.startsWith('http')) return ddgHref
  return ddgHref
}

/** Strip HTML tags from a string */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ').trim()
}

/** Parse DuckDuckGo HTML search results page */
function parseResults(html: string, max: number): SearchResult[] {
  const results: SearchResult[] = []

  // Each result lives in a div with class "result results_links results_links_deep web-result"
  // The link is in <a class="result__a" href="...">Title</a>
  // The snippet is in <a class="result__snippet" ...>Snippet text</a>
  const resultPattern = /<a[^>]+class="result__a"[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g

  let match: RegExpExecArray | null
  while ((match = resultPattern.exec(html)) !== null && results.length < max) {
    const rawUrl = match[1]
    const rawTitle = match[2]
    const rawSnippet = match[3]

    const url = extractUrl(rawUrl)
    const title = stripHtml(rawTitle)
    const snippet = stripHtml(rawSnippet)

    if (title && url) {
      results.push({ title, url, snippet })
    }
  }

  return results
}

export const webSearch = createTool({
  id: 'web_search',
  description: 'Search the web using DuckDuckGo. Returns a list of results with title, URL, and snippet. Use this when you need external information — documentation, error messages, package versions, how-tos, etc.',
  schema: {
    query: { type: 'string', description: 'The search query' },
    max_results: { type: 'number', description: 'Maximum number of results to return (default: 5)', required: false },
  },
  execute: async (args) => {
    const { query, max_results } = args as {
      query: string
      max_results?: number
    }

    const max = Math.min(max_results ?? 5, 10)
    const encodedQuery = encodeURIComponent(query)
    const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`

    try {
      const response = await fetch(url, {
        headers: {
          // Mimic a browser to avoid being blocked
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      })

      if (!response.ok) {
        throw new Error(`DuckDuckGo returned HTTP ${response.status}`)
      }

      const html = await response.text()
      const results = parseResults(html, max)

      if (results.length === 0) {
        return { message: 'No results found', query }
      }

      return { query, results }
    } catch (err) {
      throw new Error(
        `Web search failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  },
})
