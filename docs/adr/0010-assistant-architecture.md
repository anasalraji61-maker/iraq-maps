# ADR 0010: AI Assistant Architecture

Date: 2026-10-14
Status: Accepted

## Context

Iraq Smart Maps needs an AI travel assistant that can answer questions about places in Iraq, suggest routes, and help users compose messages to businesses. The assistant must work in Arabic and respect the no-invented-data rule (CLAUDE.md §1.5).

## Decision

Server-side assistant only, using Claude API via the LlmClient port:
- Sessions stored in PostgreSQL (assistant schema)
- Daily rate limit: 20 queries/user/day (configurable)
- System prompt in Arabic, instructs model to use only tool results
- LlmClient port allows switching models via ASSISTANT_MODEL env var
- No tool calling in M5; planned for M5.5
- FakeLlmClient used in tests and when ANTHROPIC_API_KEY absent

## Consequences

- Mobile app never calls Claude API directly (secrets never in binary)
- Model upgrades require only an env var change
- Rate limiting protects against abuse
- Offline: assistant unavailable (requires server round-trip)
