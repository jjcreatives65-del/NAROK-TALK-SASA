-- ============================================================================
-- TALK SASA B2B SaaS PLATFORM — POSTGRESQL MULTI-TENANT DDL SPECIFICATION
-- Target: High-Volume Political & Corporate Communications (400,000+ contacts)
-- Core Strategy: Row-Level Shared Database Isolated by tenant_id
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. ENUMERATED TYPES
-- ----------------------------------------------------------------------------
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_type') THEN
        CREATE TYPE tenant_type AS ENUM ('political', 'general');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
        CREATE TYPE subscription_status AS ENUM ('trial', 'active', 'past_due', 'cancelled', 'paused');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('owner', 'manager', 'analyst');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_type') THEN
        CREATE TYPE campaign_type AS ENUM ('sms', 'whatsapp', 'social', 'email');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_status') THEN
        CREATE TYPE campaign_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_platform') THEN
        CREATE TYPE social_platform AS ENUM ('facebook', 'instagram', 'x_twitter', 'linkedin', 'tiktok');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. TENANTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
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
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(subscription_status, is_active);

-- ----------------------------------------------------------------------------
-- 3. USER PROFILES TABLE (Extends auth.users)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
    id                  UUID PRIMARY KEY,
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    first_name          VARCHAR(100),
    last_name           VARCHAR(100),
    role                user_role NOT NULL DEFAULT 'manager',
    phone_number        VARCHAR(30),
    avatar_url          TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant_id ON user_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant_role ON user_profiles(tenant_id, role);

-- ----------------------------------------------------------------------------
-- 4. CONTACTS / CONSTITUENTS TABLE (Audience Directory — 400,000+ per tenant)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
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
    created_by          UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_contacts_tenant_phone UNIQUE (tenant_id, phone_number)
);

-- Constituents table definition (or view) for backwards compatibility
CREATE TABLE IF NOT EXISTS constituents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_number        VARCHAR(25) NOT NULL,
    first_name          VARCHAR(100),
    last_name           VARCHAR(100),
    national_id         VARCHAR(50),
    county              VARCHAR(100) DEFAULT 'Narok',
    ward                VARCHAR(100),
    polling_station     VARCHAR(150),
    is_opted_out        BOOLEAN NOT NULL DEFAULT FALSE,
    voter_status        VARCHAR(50) DEFAULT 'registered',
    preferred_channel   VARCHAR(20) DEFAULT 'sms',
    tags                TEXT[] DEFAULT '{}'::text[],
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- High-performance indexes for 400k+ scale
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_id ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_ward ON contacts(tenant_id, ward);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_county ON contacts(tenant_id, county);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_phone ON contacts(tenant_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_optout ON contacts(tenant_id, is_opted_out);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_created ON contacts(tenant_id, created_at DESC);

-- Partial index for rapid SMS/WhatsApp queue broadcast targeting
CREATE INDEX IF NOT EXISTS idx_contacts_active_ward_dispatch 
    ON contacts(tenant_id, ward) 
    WHERE is_opted_out = FALSE;

CREATE INDEX IF NOT EXISTS idx_constituents_ward ON constituents(ward);
CREATE INDEX IF NOT EXISTS idx_constituents_phone ON constituents(phone_number);
CREATE INDEX IF NOT EXISTS idx_constituents_optout ON constituents(is_opted_out);

CREATE INDEX IF NOT EXISTS idx_contacts_tenant_national_id 
    ON contacts(tenant_id, national_id) 
    WHERE national_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_tags_gin 
    ON contacts USING GIN (tags);

-- ----------------------------------------------------------------------------
-- 5. SENDER IDS TABLE (CAK Approved per tenant)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sender_ids (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sender_name         VARCHAR(11) NOT NULL,
    candidate_or_party  VARCHAR(100) NOT NULL,
    category            VARCHAR(50) DEFAULT 'Political Campaign',
    status              VARCHAR(20) DEFAULT 'approved',
    network_provider    VARCHAR(100),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sender_tenant_name UNIQUE (tenant_id, sender_name)
);

CREATE INDEX IF NOT EXISTS idx_senders_tenant ON sender_ids(tenant_id);

-- ----------------------------------------------------------------------------
-- 6. CAMPAIGNS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                  VARCHAR(150) NOT NULL,
    type                  campaign_type NOT NULL DEFAULT 'sms',
    status                campaign_status NOT NULL DEFAULT 'pending',
    message_body          TEXT NOT NULL DEFAULT '',
    sender_id             VARCHAR(11),
    target_ward           VARCHAR(100),
    target_county         VARCHAR(100),
    target_tags           TEXT[] DEFAULT '{}'::text[],
    scheduled_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_recipients      INT NOT NULL DEFAULT 0,
    successful_deliveries INT NOT NULL DEFAULT 0,
    failed_deliveries     INT NOT NULL DEFAULT 0,
    estimated_cost_kes    NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    social_sync_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
    metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by            UUID,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_id ON campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_status ON campaigns(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_type ON campaigns(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_created ON campaigns(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_queue_poller 
    ON campaigns(tenant_id, scheduled_at) 
    WHERE status = 'pending';

-- ----------------------------------------------------------------------------
-- 7. RALLY EVENTS (Grassroots Mobilization)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rally_events (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rally_title       VARCHAR(120) NOT NULL,
    venue             VARCHAR(100) NOT NULL,
    ward              VARCHAR(50) NOT NULL,
    rally_date        TIMESTAMPTZ NOT NULL,
    chief_guest       VARCHAR(100),
    expected_turnout  INT DEFAULT 5000,
    actual_rsvps      INT DEFAULT 0,
    status            VARCHAR(20) DEFAULT 'upcoming',
    blitz_campaign_id UUID REFERENCES campaigns(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rallies_tenant ON rally_events(tenant_id);

-- ----------------------------------------------------------------------------
-- 8. SOCIAL INTEGRATIONS (Phase 4 Preparation)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS social_integrations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
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
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_social_tenant_platform_account UNIQUE (tenant_id, platform, account_id)
);

CREATE INDEX IF NOT EXISTS idx_social_integrations_tenant_platform 
    ON social_integrations(tenant_id, platform);

-- Social Sync Ads (Meta/X Ad Campaigns)
CREATE TABLE IF NOT EXISTS social_sync_ads (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    campaign_id           UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    platform              VARCHAR(20) NOT NULL,
    ad_headline           VARCHAR(150) NOT NULL,
    ad_copy               TEXT NOT NULL,
    target_ward           VARCHAR(50),
    audience_hash_count   INT DEFAULT 0,
    match_rate_percentage NUMERIC(5, 2) DEFAULT 0.00,
    ad_status             VARCHAR(20) DEFAULT 'draft',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_social_sync_tenant ON social_sync_ads(tenant_id);

-- ----------------------------------------------------------------------------
-- 9. STREAM KEYS (Phase 5 Preparation)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stream_keys (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stream_title          VARCHAR(150) NOT NULL,
    talk_sasa_ingest_key  VARCHAR(120) NOT NULL UNIQUE DEFAULT ('ts_ingest_' || encode(gen_random_bytes(18), 'hex')),
    rtmp_ingest_url       TEXT NOT NULL DEFAULT 'rtmp://live.talksasa.ke/live',
    destinations          JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_live               BOOLEAN NOT NULL DEFAULT FALSE,
    last_streamed_at      TIMESTAMPTZ,
    recording_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_stream_tenant_title UNIQUE (tenant_id, stream_title)
);

CREATE INDEX IF NOT EXISTS idx_stream_keys_tenant_id ON stream_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stream_keys_ingest_key ON stream_keys(talk_sasa_ingest_key);

-- ----------------------------------------------------------------------------
-- 10. CAMPAIGN DISPATCHES LOG
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_dispatches (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    campaign_id       UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_id        UUID REFERENCES contacts(id) ON DELETE SET NULL,
    phone_number      VARCHAR(25) NOT NULL,
    channel           campaign_type NOT NULL DEFAULT 'sms',
    status            VARCHAR(20) NOT NULL DEFAULT 'queued' 
                      CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'rejected')),
    gateway_reference VARCHAR(64),
    units_consumed    INT DEFAULT 1,
    cost_kes          NUMERIC(6, 2) DEFAULT 0.80,
    dispatched_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dispatches_tenant_campaign ON campaign_dispatches(tenant_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_status ON campaign_dispatches(tenant_id, status);
