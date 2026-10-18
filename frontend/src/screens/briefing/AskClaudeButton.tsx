import { Bot } from 'lucide-react'

/** What Claude is asked first. It names the MCP tools (agent/groundwork_mcp_v1.py) so Claude reaches for live data. */
export const ASK_CLAUDE_PROMPT =
  'Use the groundwork tools to answer from live data. Summarize the latest 6 PM briefing, then list the sites ' +
  'that are STOP_WORK or CAUTION with the reason for each. Do not start or stop a storm replay.'

/**
 * Opens Claude Desktop on a new chat with the question typed in (claude:// deep link; the user presses Enter).
 * Claude Desktop starts the Groundwork MCP server itself when it opens, once agent/install_claude_desktop_v1.py
 * has added it. A browser can't launch local programs, so this is a plain link: nothing runs until Claude opens.
 */
export function AskClaudeButton({ disabled }: { disabled?: boolean }) {
  const href = `claude://claude.ai/new?q=${encodeURIComponent(ASK_CLAUDE_PROMPT)}`
  return (
    <div className="flex flex-col items-end gap-1">
      <a
        href={disabled ? undefined : href}
        aria-disabled={disabled || undefined}
        className="flex min-h-12 items-center gap-2 rounded-[3px] border-2 border-line-hi px-4 label-caps hover:bg-steel-hi aria-disabled:pointer-events-none aria-disabled:opacity-60"
      >
        <Bot aria-hidden className="size-5" /> Ask Claude
      </a>
      <p className="max-w-56 text-right text-[0.75rem] text-muted">Opens Claude Desktop with our MCP tools</p>
    </div>
  )
}
