-- ========================================================
-- TALK SASA POLITICAL CRM & OMNICHANNEL PLATFORM
-- PostgreSQL Schema Specification & High-Performance Indexes
-- ========================================================

-- Enable UUID extension if on PostgreSQL
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Constituents (Contacts) Table: Core voter & outreach directory
CREATE TABLE IF NOT EXISTS constituents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    national_id VARCHAR(20) UNIQUE,
    county VARCHAR(50) DEFAULT 'Narok',
    ward VARCHAR(50),
    polling_station VARCHAR(100),
    is_opted_out BOOLEAN DEFAULT FALSE,
    voter_status VARCHAR(30) DEFAULT 'registered', -- registered, youth_first_time, elder, diaspora
    preferred_channel VARCHAR(20) DEFAULT 'sms',   -- sms, whatsapp, voice, email
    tags TEXT[],                                   -- e.g. ['rally_attendee', 'youth_mobilizer', 'boda_leader']
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for lightning-fast segmentation queries
CREATE INDEX IF NOT EXISTS idx_constituents_ward ON constituents(ward);
CREATE INDEX IF NOT EXISTS idx_constituents_phone ON constituents(phone_number);
CREATE INDEX IF NOT EXISTS idx_constituents_optout ON constituents(is_opted_out);
CREATE INDEX IF NOT EXISTS idx_constituents_voter_status ON constituents(voter_status);

-- 2. Customized Sender IDs Table (Approved by Communications Authority of Kenya / Africa's Talking)
CREATE TABLE IF NOT EXISTS sender_ids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_name VARCHAR(11) UNIQUE NOT NULL,      -- Max 11 alphanumeric characters (e.g. NAROK_LEDIR, SENATE2027)
    candidate_or_party VARCHAR(100) NOT NULL,
    category VARCHAR(50) DEFAULT 'Political Campaign',
    status VARCHAR(20) DEFAULT 'approved',         -- pending_approval, approved, active, suspended
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Campaigns Table: Omnichannel broadcast definitions
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_name VARCHAR(100) NOT NULL,
    channel VARCHAR(30) DEFAULT 'sms',             -- sms, whatsapp, email, voice_ivr, multi
    sender_id VARCHAR(20) DEFAULT 'NAROK_TALK',
    message_body TEXT NOT NULL,
    target_ward VARCHAR(50),                       -- NULL means all Narok wards
    status VARCHAR(20) DEFAULT 'pending',          -- pending, scheduled, processing, completed, cancelled
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_recipients INT DEFAULT 0,
    successful_deliveries INT DEFAULT 0,
    failed_deliveries INT DEFAULT 0,
    estimated_cost_kes NUMERIC(10, 2) DEFAULT 0.00,
    social_sync_enabled BOOLEAN DEFAULT FALSE,     -- Synchronize with Meta/X ads
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_target_ward ON campaigns(target_ward);

-- 4. Political Rallies & Grassroots Mobilization Events
CREATE TABLE IF NOT EXISTS rally_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rally_title VARCHAR(120) NOT NULL,
    venue VARCHAR(100) NOT NULL,
    ward VARCHAR(50) NOT NULL,
    rally_date TIMESTAMP WITH TIME ZONE NOT NULL,
    chief_guest VARCHAR(100),
    expected_turnout INT DEFAULT 5000,
    actual_rsvps INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'upcoming',         -- upcoming, live, completed, cancelled
    blitz_campaign_id UUID REFERENCES campaigns(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Social Media Sync (Meta Ads & X/Twitter Campaign Ads)
CREATE TABLE IF NOT EXISTS social_sync_ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    platform VARCHAR(20) NOT NULL,                 -- facebook, x_twitter, both
    ad_headline VARCHAR(150) NOT NULL,
    ad_copy TEXT NOT NULL,
    target_ward VARCHAR(50),
    audience_hash_count INT DEFAULT 0,
    match_rate_percentage NUMERIC(5, 2) DEFAULT 0.00,
    ad_status VARCHAR(20) DEFAULT 'draft',         -- draft, synced, active, paused
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Granular Campaign Dispatch Logs (Africa's Talking & Meta Webhooks)
CREATE TABLE IF NOT EXISTS campaign_dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    constituent_id UUID REFERENCES constituents(id) ON DELETE CASCADE,
    phone_number VARCHAR(15) NOT NULL,
    channel VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'sent',             -- queued, sent, delivered, failed, rejected
    gateway_reference VARCHAR(64),
    units_consumed INT DEFAULT 1,
    cost_kes NUMERIC(6, 2) DEFAULT 0.80,
    dispatched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dispatches_campaign_id ON campaign_dispatches(campaign_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_phone ON campaign_dispatches(phone_number);
