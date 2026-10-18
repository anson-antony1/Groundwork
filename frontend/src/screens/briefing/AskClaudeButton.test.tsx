import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ASK_CLAUDE_PROMPT, AskClaudeButton } from './AskClaudeButton'

describe('AskClaudeButton', () => {
  it('deep-links into Claude Desktop with the question typed in', () => {
    render(<AskClaudeButton />)
    const href = screen.getByRole('link', { name: /ask claude/i }).getAttribute('href') ?? ''
    expect(href.startsWith('claude://claude.ai/new?q=')).toBe(true)
    expect(decodeURIComponent(href.split('q=')[1])).toBe(ASK_CLAUDE_PROMPT)
  })

  it('is not a link before there is a briefing', () => {
    render(<AskClaudeButton disabled />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
