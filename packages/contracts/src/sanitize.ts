/**
 * Minimal HTML/XSS sanitizer for user-generated text stored in the database.
 * Strips all HTML tags and decodes common HTML entities.
 * No external dependencies — contracts must stay lightweight.
 */

/** Strips HTML tags and dangerous characters from a user-supplied string. */
export function sanitize(input: string): string {
  return (
    input
      // Remove script/style blocks with content
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
      // Remove all remaining tags
      .replace(/<[^>]+>/g, '')
      // Decode common HTML entities so stored text is human-readable
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      // Collapse excess whitespace introduced by stripping tags
      .replace(/\s{3,}/g, '  ')
      .trim()
  );
}

/** Sanitizes display names: strips HTML and enforces a max length of 100 chars. */
export function sanitizeDisplayName(input: string): string {
  return sanitize(input).slice(0, 100);
}

/** Sanitizes post/comment content: strips HTML and enforces a max length of 2000 chars. */
export function sanitizeContent(input: string): string {
  return sanitize(input).slice(0, 2000);
}
