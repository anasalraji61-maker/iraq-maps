-- M193: add avg_response_hours for provider response time badge
ALTER TABLE providers.provider
  ADD COLUMN IF NOT EXISTS avg_response_hours integer;
