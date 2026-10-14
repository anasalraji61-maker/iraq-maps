/** Read ASSISTANT_MODEL from env. Returns undefined when unset (caller falls back to fake). */
export function getAssistantModel(): string | undefined {
  const val = process.env['ASSISTANT_MODEL'];
  return val && val.length > 0 ? val : undefined;
}
