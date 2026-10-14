-- Daily aggregated token usage (no PII — counts only)
CREATE TABLE IF NOT EXISTS assistant.usage_daily (
  date date NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (date)
);
