-- Add provider_logo to the asset_purpose enum
-- Must use ALTER TYPE because PostgreSQL does not support removing enum values,
-- so the migration is additive-only and safe for rolling deployments.
ALTER TYPE media.asset_purpose ADD VALUE IF NOT EXISTS 'provider_logo';
