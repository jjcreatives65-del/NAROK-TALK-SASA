-- ============================================================================
-- TALK SASA B2B SaaS PLATFORM — PHASE 1: MULTI-TENANT FOUNDATION
-- Migration Version: 20261003000000_talk_sasa_phase1_foundation.sql
-- Engine: PostgreSQL 15+ / Supabase
-- Target Scale: 400,000+ contacts per tenant, high-volume queue-driven broadcasts
-- Security: Strict Row-Level Security (RLS) with cached JWT tenant isolation
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS & PREREQUISITES
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 2. ENUMERATED TYPES (Idempotent creation)
-- ----------------------------------------------------------------------------
DO $$ 
BEGIN
    -- Tenant Organization Category
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_type') THEN
        CREATE TYPE tenant_type AS ENUM ('political', 'general');
    END IF;

    -- Tenant Subscription Lifecycle
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
        CREATE TYPE subscription_status AS ENUM ('trial', 'active', 'past_due', 'cancelled', 'paused');
    END IF;

    -- User Role Hierarchy
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('owner', 'manager', 'analyst');
    END IF;

    -- Broadcast Campaign Channel Type
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_type') THEN
        CREATE TYPE campaign_type AS ENUM ('sms', 'whatsapp', 'social', 'email');
    END IF;

    -- Campaign Dispatch Status
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_status') THEN
        CREATE TYPE campaign_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
    END IF;

    -- Social Media Platform Type
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_platform') THEN
        CREATE TYPE social_platform AS ENUM ('facebook', 'instagram', 'x_twitter', 'linkedin', 'tiktok');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. CORE MULTI-TENANT TABLES
-- ----------------------------------------------------------------------------

-- 3a. Tenants: Organization accounts (Political campaigns & Corporate clients)
CREATE TABLE IF NOT EXISTS public.tenants (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(150) NOT NULL,
    slug                VARCHAR(100) UNIQUE NOT NULL,
    tenant_type         tenant_type NOT NULL DEFAULT 'political',
    sender_id           VARCHAR(11) DEFAULT 'TALKSASA',
    subscription_status subscription_status NOT NULL DEFAULT 'active',
    county              VARCHAR(100) DEFAULT 'Narok',
    logo_url            TEXT,
    settings            JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure backwards compatibility if tenants table pre-existed with text types
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'tenant_type') THEN
        ALTER TABLE public.tenants ADD COLUMN tenant_type tenant_type NOT NULL DEFAULT 'political';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'sender_id') THEN
        ALTER TABLE public.tenants ADD COLUMN sender_id VARCHAR(11) DEFAULT 'TALKSASA';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'subscription_status') THEN
        ALTER TABLE public.tenants ADD COLUMN subscription_status subscription_status NOT NULL DEFAULT 'active';
    END IF;
END $$;

-- 3b. User Profiles: Extends Supabase auth.users (1-to-1 link)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    first_name          VARCHAR(100),
    last_name           VARCHAR(100),
    role                user_role NOT NULL DEFAULT 'manager',
    phone_number        VARCHAR(30),
    avatar_url          TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3c. Contacts: Constituents & Audience CRM (Engineered for 400,000+ per tenant)
CREATE TABLE IF NOT EXISTS public.contacts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    phone_number        VARCHAR(25) NOT NULL,
    email               VARCHAR(255),
    first_name          VARCHAR(100),
    last_name           VARCHAR(100),
    national_id         VARCHAR(50),
    county              VARCHAR(100) DEFAULT 'Narok',
    ward                VARCHAR(100),
    polling_station     VARCHAR(150),
    is_opted_out        BOOLEAN NOT NULL DEFAULT FALSE,
    voter_status        VARCHAR(50) DEFAULT 'registered',
    preferred_channel   campaign_type DEFAULT 'sms',
    tags                TEXT[] DEFAULT '{}'::text[],
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_contacts_tenant_phone UNIQUE (tenant_id, phone_number)
);

-- ----------------------------------------------------------------------------
-- Safe Migration: If 'constituents' exists as a BASE TABLE, migrate data to 'contacts'
-- and convert 'constituents' into an updatable view
-- ----------------------------------------------------------------------------
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name = 'constituents' 
          AND table_type = 'BASE TABLE'
    ) THEN
        INSERT INTO public.contacts (
            id, tenant_id, phone_number, first_name, last_name, national_id,
            county, ward, polling_station, is_opted_out, voter_status,
            tags, created_by, created_at
        )
        SELECT 
            id, tenant_id, phone_number, first_name, last_name, national_id,
            county, ward, polling_station, is_opted_out, voter_status,
            tags, created_by, created_at
        FROM public.constituents
        ON CONFLICT (tenant_id, phone_number) DO NOTHING;

        DROP TABLE public.constituents CASCADE;
    END IF;
END $$;

-- Backward compatibility view: Exposes contacts as 'constituents' for legacy endpoints
CREATE OR REPLACE VIEW public.constituents AS
SELECT 
    id,
    tenant_id,
    phone_number,
    first_name,
    last_name,
    national_id,
    county,
    ward,
    polling_station,
    is_opted_out,
    voter_status,
    preferred_channel::text AS preferred_channel,
    tags,
    metadata,
    created_by,
    created_at,
    updated_at
FROM public.contacts;

-- 3d. Campaigns: Tracks scheduled or sent broadcasts (SMS, WhatsApp, Social, Email)
CREATE TABLE IF NOT EXISTS public.campaigns (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name                  VARCHAR(150) NOT NULL,
    type                  campaign_type NOT NULL DEFAULT 'sms',
    status                campaign_status NOT NULL DEFAULT 'pending',
    message_body          TEXT NOT NULL DEFAULT '',
    sender_id             VARCHAR(11),
    target_ward           VARCHAR(100),
    target_county         VARCHAR(100),
    target_tags           TEXT[] DEFAULT '{}'::text[],
    scheduled_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    total_recipients      INT NOT NULL DEFAULT 0,
    successful_deliveries INT NOT NULL DEFAULT 0,
    failed_deliveries     INT NOT NULL DEFAULT 0,
    estimated_cost_kes    NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    social_sync_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
    metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backwards compatibility: add 'name' or 'type' if campaigns table had previous column names
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'campaigns' AND column_name = 'name') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'campaigns' AND column_name = 'campaign_name') THEN
            ALTER TABLE public.campaigns ADD COLUMN name VARCHAR(150);
            UPDATE public.campaigns SET name = campaign_name WHERE name IS NULL;
            ALTER TABLE public.campaigns ALTER COLUMN name SET NOT NULL;
        ELSE
            ALTER TABLE public.campaigns ADD COLUMN name VARCHAR(150) NOT NULL DEFAULT 'Untitled Campaign';
        END IF;
    END IF;
END $$;

-- 3e. Social Integrations (Phase 4 Preparation)
-- Stores encrypted OAuth tokens for Meta (Facebook & Instagram) and X per tenant
CREATE TABLE IF NOT EXISTS public.social_integrations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    platform                social_platform NOT NULL,
    account_id              VARCHAR(120),
    account_name            VARCHAR(150),
    encrypted_access_token  TEXT NOT NULL,
    encrypted_token_secret  TEXT,
    encrypted_refresh_token TEXT,
    token_expires_at        TIMESTAMPTZ,
    scopes                  TEXT[] DEFAULT '{}'::text[],
    status                  VARCHAR(30) NOT NULL DEFAULT 'connected' 
                            CHECK (status IN ('connected', 'expired', 'revoked', 'error')),
    metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_social_tenant_platform_account UNIQUE (tenant_id, platform, account_id)
);

-- 3f. Stream Keys (Phase 5 Preparation)
-- Stores OBS Ingest keys and external RTMP broadcast destinations (YouTube, Facebook Live, X)
CREATE TABLE IF NOT EXISTS public.stream_keys (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    stream_title          VARCHAR(150) NOT NULL,
    talk_sasa_ingest_key  VARCHAR(120) NOT NULL UNIQUE DEFAULT ('ts_ingest_' || encode(gen_random_bytes(18), 'hex')),
    rtmp_ingest_url       TEXT NOT NULL DEFAULT 'rtmp://live.talksasa.ke/live',
    destinations          JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_live               BOOLEAN NOT NULL DEFAULT FALSE,
    last_streamed_at      TIMESTAMPTZ,
    recording_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_stream_tenant_title UNIQUE (tenant_id, stream_title)
);

-- ----------------------------------------------------------------------------
-- 4. HIGH-PERFORMANCE INDEXING (Optimized for 400,000+ Contacts per Tenant)
-- Rule: tenant_id MUST be leading column in B-tree indexes to enable immediate
-- sub-millisecond index partition seeks.
-- ----------------------------------------------------------------------------

-- Indexes on 'tenants'
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(subscription_status, is_active);

-- Indexes on 'user_profiles'
CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant_id ON public.user_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant_role ON public.user_profiles(tenant_id, role);

-- Indexes on 'contacts' (Target: 400,000+ rows)
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_id ON public.contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_ward ON public.contacts(tenant_id, ward);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_county ON public.contacts(tenant_id, county);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_phone ON public.contacts(tenant_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_optout ON public.contacts(tenant_id, is_opted_out);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_created ON public.contacts(tenant_id, created_at DESC);

-- Partial covering index for high-speed broadcast queue dispatching
-- Filters out opted-out contacts at the index level, reducing working memory by 30-50%
CREATE INDEX IF NOT EXISTS idx_contacts_active_ward_dispatch 
    ON public.contacts(tenant_id, ward) 
    WHERE is_opted_out = FALSE;

-- Sparse index for national ID lookups
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_national_id 
    ON public.contacts(tenant_id, national_id) 
    WHERE national_id IS NOT NULL;

-- GIN index for campaign tag targeting (e.g. tags @> ARRAY['youth_leader'])
CREATE INDEX IF NOT EXISTS idx_contacts_tags_gin 
    ON public.contacts USING GIN (tags);

-- Indexes on 'campaigns'
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_id ON public.campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_status ON public.campaigns(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_type ON public.campaigns(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_created ON public.campaigns(tenant_id, created_at DESC);

-- Partial index for background worker queue polling (select pending scheduled jobs)
CREATE INDEX IF NOT EXISTS idx_campaigns_queue_poller 
    ON public.campaigns(tenant_id, scheduled_at) 
    WHERE status = 'pending';

-- Indexes on 'social_integrations'
CREATE INDEX IF NOT EXISTS idx_social_integrations_tenant_platform 
    ON public.social_integrations(tenant_id, platform);

-- Indexes on 'stream_keys'
CREATE INDEX IF NOT EXISTS idx_stream_keys_tenant_id 
    ON public.stream_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stream_keys_ingest_key 
    ON public.stream_keys(talk_sasa_ingest_key);

-- ----------------------------------------------------------------------------
-- 5. AUTOMATED TIMESTAMP MANAGEMENT
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
CREATE TRIGGER trg_tenants_updated_at 
    BEFORE UPDATE ON public.tenants 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at 
    BEFORE UPDATE ON public.user_profiles 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_contacts_updated_at ON public.contacts;
CREATE TRIGGER trg_contacts_updated_at 
    BEFORE UPDATE ON public.contacts 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON public.campaigns;
CREATE TRIGGER trg_campaigns_updated_at 
    BEFORE UPDATE ON public.campaigns 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_social_integrations_updated_at ON public.social_integrations;
CREATE TRIGGER trg_social_integrations_updated_at 
    BEFORE UPDATE ON public.social_integrations 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_stream_keys_updated_at ON public.stream_keys;
CREATE TRIGGER trg_stream_keys_updated_at 
    BEFORE UPDATE ON public.stream_keys 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 6. RLS HELPER FUNCTIONS (Optimized & Secure)
-- Uses SECURITY DEFINER with fixed search_path to prevent escalation attacks
-- ----------------------------------------------------------------------------

-- Helper 1: Retrieve Current User's Tenant ID (Fast in-memory JWT with table fallback)
CREATE OR REPLACE FUNCTION public.get_current_user_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant_id UUID;
    v_claim_text TEXT;
BEGIN
    -- 1. Try reading directly from PostgREST JWT claim parameter (0ms overhead)
    v_claim_text := current_setting('request.jwt.claim.tenant_id', true);
    IF v_claim_text IS NOT NULL AND v_claim_text <> '' THEN
        RETURN v_claim_text::UUID;
    END IF;

    -- 2. Try parsing from request.jwt.claims JSON object
    BEGIN
        v_claim_text := current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id';
        IF v_claim_text IS NOT NULL AND v_claim_text <> '' THEN
            RETURN v_claim_text::UUID;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Non-fatal: proceed to database lookup
    END;

    -- 3. Fallback: Query public.user_profiles for authenticated user
    SELECT tenant_id INTO v_tenant_id
    FROM public.user_profiles
    WHERE id = auth.uid()
    LIMIT 1;

    RETURN v_tenant_id;
END;
$$;

-- Helper 2: Retrieve Current User's Role (owner, manager, analyst)
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role user_role;
    v_claim_text TEXT;
BEGIN
    -- 1. Check JWT claim
    v_claim_text := current_setting('request.jwt.claim.role', true);
    IF v_claim_text IS NOT NULL AND v_claim_text IN ('owner', 'manager', 'analyst') THEN
        RETURN v_claim_text::user_role;
    END IF;

    -- 2. Fallback to public.user_profiles
    SELECT role INTO v_role
    FROM public.user_profiles
    WHERE id = auth.uid()
    LIMIT 1;

    RETURN COALESCE(v_role, 'analyst'::user_role);
END;
$$;

-- Helper 3: Check if current user is owner or manager (admin actions)
CREATE OR REPLACE FUNCTION public.is_tenant_manager_or_owner()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.get_current_user_role() IN ('owner'::user_role, 'manager'::user_role);
$$;

-- ----------------------------------------------------------------------------
-- 7. SUPABASE AUTH CUSTOM ACCESS TOKEN HOOK
-- Automatically injects tenant_id and role into every minted Supabase JWT
-- Register in Supabase Dashboard > Auth > Hooks > Custom Access Token Hook
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id   UUID;
    v_tenant_id UUID;
    v_role      user_role;
    claims      JSONB;
BEGIN
    v_user_id := (event ->> 'user_id')::UUID;
    claims    := event -> 'claims';

    -- Fetch user profile
    SELECT tenant_id, role
    INTO   v_tenant_id, v_role
    FROM   public.user_profiles
    WHERE  id = v_user_id
      AND  is_active = TRUE
    LIMIT 1;

    -- Inject claims if profile exists
    IF v_tenant_id IS NOT NULL THEN
        claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant_id::TEXT));
        claims := jsonb_set(claims, '{role}',      to_jsonb(v_role::TEXT));
    END IF;

    RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grant execution to Supabase auth admin daemon
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
        GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(JSONB) TO supabase_auth_admin;
        REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(JSONB) FROM PUBLIC;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 8. AUTO-PROVISION USER PROFILE ON SIGNUP TRIGGER
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant_id UUID;
    v_raw_tenant TEXT;
BEGIN
    -- Extract tenant_id from user signup metadata if supplied
    v_raw_tenant := NEW.raw_user_meta_data ->> 'tenant_id';
    IF v_raw_tenant IS NOT NULL AND v_raw_tenant <> '' THEN
        v_tenant_id := v_raw_tenant::UUID;
    ELSE
        -- Default to the primary anchor tenant if none specified
        SELECT id INTO v_tenant_id FROM public.tenants ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF v_tenant_id IS NOT NULL THEN
        INSERT INTO public.user_profiles (
            id,
            tenant_id,
            first_name,
            last_name,
            role,
            phone_number
        ) VALUES (
            NEW.id,
            v_tenant_id,
            COALESCE(NEW.raw_user_meta_data ->> 'first_name', split_part(NEW.raw_user_meta_data ->> 'full_name', ' ', 1)),
            COALESCE(NEW.raw_user_meta_data ->> 'last_name', split_part(NEW.raw_user_meta_data ->> 'full_name', ' ', 2)),
            COALESCE((NEW.raw_user_meta_data ->> 'role')::user_role, 'manager'::user_role),
            NEW.raw_user_meta_data ->> 'phone_number'
        ) ON CONFLICT (id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 9. STRICT ROW-LEVEL SECURITY (RLS) POLICIES
-- Zero cross-tenant data leakage. Full CRUD isolation on all operational tables.
-- ----------------------------------------------------------------------------

-- Enable and Force RLS on all tables
ALTER TABLE public.tenants            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants            FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles      FORCE ROW LEVEL SECURITY;

ALTER TABLE public.contacts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts           FORCE ROW LEVEL SECURITY;

ALTER TABLE public.campaigns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns          FORCE ROW LEVEL SECURITY;

ALTER TABLE public.social_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_integrations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.stream_keys        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_keys        FORCE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- RLS: TENANTS TABLE
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_select_own" ON public.tenants;
CREATE POLICY "tenant_select_own" ON public.tenants
    FOR SELECT 
    TO authenticated
    USING (id = public.get_current_user_tenant_id());

DROP POLICY IF EXISTS "tenant_update_owner_only" ON public.tenants;
CREATE POLICY "tenant_update_owner_only" ON public.tenants
    FOR UPDATE
    TO authenticated
    USING (id = public.get_current_user_tenant_id() AND public.get_current_user_role() = 'owner')
    WITH CHECK (id = public.get_current_user_tenant_id() AND public.get_current_user_role() = 'owner');

-- ----------------------------------------------------------------------------
-- RLS: USER_PROFILES TABLE
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "user_profiles_select_tenant" ON public.user_profiles;
CREATE POLICY "user_profiles_select_tenant" ON public.user_profiles
    FOR SELECT
    TO authenticated
    USING (tenant_id = public.get_current_user_tenant_id());

DROP POLICY IF EXISTS "user_profiles_insert_tenant" ON public.user_profiles;
CREATE POLICY "user_profiles_insert_tenant" ON public.user_profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (tenant_id = public.get_current_user_tenant_id() AND public.is_tenant_manager_or_owner())
        OR id = auth.uid()
    );

DROP POLICY IF EXISTS "user_profiles_update_tenant" ON public.user_profiles;
CREATE POLICY "user_profiles_update_tenant" ON public.user_profiles
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id = public.get_current_user_tenant_id() 
        AND (id = auth.uid() OR public.is_tenant_manager_or_owner())
    )
    WITH CHECK (
        tenant_id = public.get_current_user_tenant_id() 
        AND (id = auth.uid() OR public.is_tenant_manager_or_owner())
    );

DROP POLICY IF EXISTS "user_profiles_delete_owner" ON public.user_profiles;
CREATE POLICY "user_profiles_delete_owner" ON public.user_profiles
    FOR DELETE
    TO authenticated
    USING (
        tenant_id = public.get_current_user_tenant_id() 
        AND public.get_current_user_role() = 'owner'
        AND id <> auth.uid() -- Prevent owner from accidentally deleting their own root profile
    );

-- ----------------------------------------------------------------------------
-- RLS: CONTACTS TABLE (Constituents/Audience)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "contacts_select_tenant" ON public.contacts;
CREATE POLICY "contacts_select_tenant" ON public.contacts
    FOR SELECT
    TO authenticated
    USING (tenant_id = public.get_current_user_tenant_id());

DROP POLICY IF EXISTS "contacts_insert_tenant" ON public.contacts;
CREATE POLICY "contacts_insert_tenant" ON public.contacts
    FOR INSERT
    TO authenticated
    WITH CHECK (tenant_id = public.get_current_user_tenant_id());

DROP POLICY IF EXISTS "contacts_update_tenant" ON public.contacts;
CREATE POLICY "contacts_update_tenant" ON public.contacts
    FOR UPDATE
    TO authenticated
    USING (tenant_id = public.get_current_user_tenant_id())
    WITH CHECK (tenant_id = public.get_current_user_tenant_id());

DROP POLICY IF EXISTS "contacts_delete_tenant" ON public.contacts;
CREATE POLICY "contacts_delete_tenant" ON public.contacts
    FOR DELETE
    TO authenticated
    USING (
        tenant_id = public.get_current_user_tenant_id() 
        AND public.is_tenant_manager_or_owner()
    );

-- ----------------------------------------------------------------------------
-- RLS: CAMPAIGNS TABLE
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "campaigns_select_tenant" ON public.campaigns;
CREATE POLICY "campaigns_select_tenant" ON public.campaigns
    FOR SELECT
    TO authenticated
    USING (tenant_id = public.get_current_user_tenant_id());

DROP POLICY IF EXISTS "campaigns_insert_tenant" ON public.campaigns;
CREATE POLICY "campaigns_insert_tenant" ON public.campaigns
    FOR INSERT
    TO authenticated
    WITH CHECK (tenant_id = public.get_current_user_tenant_id());

DROP POLICY IF EXISTS "campaigns_update_tenant" ON public.campaigns;
CREATE POLICY "campaigns_update_tenant" ON public.campaigns
    FOR UPDATE
    TO authenticated
    USING (tenant_id = public.get_current_user_tenant_id())
    WITH CHECK (tenant_id = public.get_current_user_tenant_id());

DROP POLICY IF EXISTS "campaigns_delete_tenant" ON public.campaigns;
CREATE POLICY "campaigns_delete_tenant" ON public.campaigns
    FOR DELETE
    TO authenticated
    USING (
        tenant_id = public.get_current_user_tenant_id() 
        AND public.is_tenant_manager_or_owner()
    );

-- ----------------------------------------------------------------------------
-- RLS: SOCIAL_INTEGRATIONS TABLE
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "social_integrations_select_tenant" ON public.social_integrations;
CREATE POLICY "social_integrations_select_tenant" ON public.social_integrations
    FOR SELECT
    TO authenticated
    USING (tenant_id = public.get_current_user_tenant_id());

DROP POLICY IF EXISTS "social_integrations_insert_tenant" ON public.social_integrations;
CREATE POLICY "social_integrations_insert_tenant" ON public.social_integrations
    FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = public.get_current_user_tenant_id() 
        AND public.is_tenant_manager_or_owner()
    );

DROP POLICY IF EXISTS "social_integrations_update_tenant" ON public.social_integrations;
CREATE POLICY "social_integrations_update_tenant" ON public.social_integrations
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id = public.get_current_user_tenant_id() 
        AND public.is_tenant_manager_or_owner()
    )
    WITH CHECK (
        tenant_id = public.get_current_user_tenant_id() 
        AND public.is_tenant_manager_or_owner()
    );

DROP POLICY IF EXISTS "social_integrations_delete_tenant" ON public.social_integrations;
CREATE POLICY "social_integrations_delete_tenant" ON public.social_integrations
    FOR DELETE
    TO authenticated
    USING (
        tenant_id = public.get_current_user_tenant_id() 
        AND public.get_current_user_role() = 'owner'
    );

-- ----------------------------------------------------------------------------
-- RLS: STREAM_KEYS TABLE
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "stream_keys_select_tenant" ON public.stream_keys;
CREATE POLICY "stream_keys_select_tenant" ON public.stream_keys
    FOR SELECT
    TO authenticated
    USING (tenant_id = public.get_current_user_tenant_id());

DROP POLICY IF EXISTS "stream_keys_insert_tenant" ON public.stream_keys;
CREATE POLICY "stream_keys_insert_tenant" ON public.stream_keys
    FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = public.get_current_user_tenant_id() 
        AND public.is_tenant_manager_or_owner()
    );

DROP POLICY IF EXISTS "stream_keys_update_tenant" ON public.stream_keys;
CREATE POLICY "stream_keys_update_tenant" ON public.stream_keys
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id = public.get_current_user_tenant_id() 
        AND public.is_tenant_manager_or_owner()
    )
    WITH CHECK (
        tenant_id = public.get_current_user_tenant_id() 
        AND public.is_tenant_manager_or_owner()
    );

DROP POLICY IF EXISTS "stream_keys_delete_tenant" ON public.stream_keys;
CREATE POLICY "stream_keys_delete_tenant" ON public.stream_keys
    FOR DELETE
    TO authenticated
    USING (
        tenant_id = public.get_current_user_tenant_id() 
        AND public.get_current_user_role() = 'owner'
    );

-- ----------------------------------------------------------------------------
-- 10. INITIAL SEED: ANCHOR TENANT
-- ----------------------------------------------------------------------------
INSERT INTO public.tenants (
    id,
    name,
    slug,
    tenant_type,
    sender_id,
    subscription_status,
    county
) VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Talk Sasa Anchor Tenant (Narok Central)',
    'talk-sasa-anchor',
    'political',
    'TALKSASA',
    'active',
    'Narok'
) ON CONFLICT (id) DO UPDATE 
SET 
    tenant_type = EXCLUDED.tenant_type,
    sender_id   = EXCLUDED.sender_id,
    subscription_status = EXCLUDED.subscription_status;

-- End of Migration Script
