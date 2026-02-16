/**
 * Crux — web_search tool
 *
 * Search the web using a SearXNG instance's JSON API.
 * Requires a configured base_url pointing to a SearXNG server.
 */

import { createTool } from '@elfenlabs/cog'

/** A single search result */
interface SearchResult {
  title: string
  url: string
  snippet: string
}

/** SearXNG JSON response shape */
interface SearXNGResponse {
  results: Array<{
    title: string
    url: string
    content: string
  }>
}

/** Create a web_search tool backed by a SearXNG instance */
export function createWebSearchTool(baseUrl: string) {
  // Strip trailing slash for clean URL construction
  const base = baseUrl.replace(/\/+$/, '')

  return createTool({
    id: 'web_search',
    description:
      'Search the web via SearXNG. Returns a list of results with title, URL, and snippet. Use this when you need external information — documentation, error messages, package versions, how-tos, etc.',
    schema: {
      query: { type: 'string', description: 'The search query' },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5)',
        required: false,
      },
    },
    execute: async (args) => {
      const { query, max_results } = args as {
        query: string
        max_results?: number
      }

      const max = Math.min(max_results ?? 5, 10)
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        language: 'en',
      })
      const url = `${base}/search?${params.toString()}`

      try {
        const response = await fetch(url, {
          headers: {
            Accept: 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error(`SearXNG returned HTTP ${response.status}`)
        }

        const data = (await response.json()) as SearXNGResponse

        const results: SearchResult[] = data.results
          .slice(0, max)
          .map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.content,
          }))

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
}
