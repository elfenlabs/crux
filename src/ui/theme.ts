/**
 * Crux — Theme
 *
 * Color palette and style constants for the TUI.
 */

export const theme = {
  // Brand
  accent: '#7C3AED',       // violet-600
  accentDim: '#4C1D95',    // violet-900

  // Surfaces
  bg: '#0F172A',           // slate-900
  surface: '#1E293B',      // slate-800
  border: '#334155',       // slate-700

  // Text
  text: '#E2E8F0',         // slate-200
  textDim: '#64748B',      // slate-500
  textMuted: '#475569',    // slate-600

  // Semantic
  success: '#10B981',      // emerald-500
  warning: '#F59E0B',      // amber-500
  error: '#EF4444',        // red-500
  info: '#3B82F6',         // blue-500

  // Safety tiers (future)
  tierRead: '#10B981',     // green
  tierModify: '#F59E0B',   // yellow
  tierDestroy: '#EF4444',  // red

  // Misc
  thinking: '#64748B',     // dimmed text for reasoning
  prompt: '#7C3AED',       // prompt symbol color
  user: '#38BDF8',         // sky-400 for user messages
} as const
