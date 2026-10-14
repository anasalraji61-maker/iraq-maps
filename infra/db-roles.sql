-- db-roles.sql — Per-schema Postgres roles for Iraq Smart Maps
-- Run once as superuser before migrations.
-- Each schema gets:
--   <schema>_migrator  — can CREATE/ALTER/DROP within the schema (used by drizzle-kit)
--   app role           — SELECT/INSERT/UPDATE/DELETE only (used by the running API)

-- App role (DML only, no DDL)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'iraqmaps_app') THEN
    CREATE ROLE iraqmaps_app NOLOGIN;
  END IF;
END $$;

-- Per-schema migrator roles + grant DML to app role
-- Schemas: activity, assistant, discover, identity, media, messaging, notifications, places, providers

DO $$ 
DECLARE
  schemas text[] := ARRAY['activity','assistant','discover','identity','media','messaging','notifications','places','providers'];
  s text;
  migrator_role text;
BEGIN
  FOREACH s IN ARRAY schemas LOOP
    migrator_role := s || '_migrator';

    -- Create migrator role if not exists
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = migrator_role) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', migrator_role);
    END IF;

    -- Migrator: full DDL on the schema + sequences + tables
    EXECUTE format('GRANT ALL ON SCHEMA %I TO %I', s, migrator_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON TABLES TO %I', s, migrator_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON SEQUENCES TO %I', s, migrator_role);

    -- App role: DML only (no CREATE/ALTER/DROP)
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO iraqmaps_app', s);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO iraqmaps_app', s);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE ON SEQUENCES TO iraqmaps_app', s);

    -- Grant on existing tables (for schemas already created)
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO iraqmaps_app', s);
    EXECUTE format('GRANT USAGE ON ALL SEQUENCES IN SCHEMA %I TO iraqmaps_app', s);

  END LOOP;
END $$;

-- Login users (passwords come from env; create them outside this script)
-- CREATE USER iraqmaps_api PASSWORD '...' IN ROLE iraqmaps_app;
-- CREATE USER iraqmaps_migrate_identity PASSWORD '...' IN ROLE identity_migrator;
-- (etc. — one login per schema migrator for isolation)
