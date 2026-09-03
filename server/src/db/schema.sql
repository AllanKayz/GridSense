-- GridSense AI PostgreSQL/PostGIS Database Schema

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Customer Categories
CREATE TABLE IF NOT EXISTS customer_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    avg_consumption_kwh_day NUMERIC(10, 2) DEFAULT 15.0,
    default_tariff_rate NUMERIC(10, 4) DEFAULT 0.15,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_number VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    masked_name VARCHAR(150) NOT NULL,
    category_id UUID REFERENCES customer_categories(id),
    is_critical BOOLEAN DEFAULT FALSE,
    critical_reason TEXT,
    contact_email VARCHAR(100),
    contact_phone VARCHAR(50),
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users & RBAC
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'DISPATCHER', -- ADMIN, DISPATCHER, FIELD_ENGINEER, GUEST
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Generic Electrical Network Nodes
CREATE TABLE IF NOT EXISTS network_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    asset_type VARCHAR(50) NOT NULL, -- SUBSTATION, FEEDER, LINE_SEGMENT, TRANSFORMER, POLE, SWITCH, METER
    status VARCHAR(30) DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, FAULTED, MAINTENANCE
    voltage_kv NUMERIC(8, 2),
    parent_asset_id VARCHAR(50),
    properties JSONB DEFAULT '{}'::jsonb,
    geom GEOMETRY(Geometry, 4326),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_network_nodes_asset_id ON network_nodes(asset_id);
CREATE INDEX IF NOT EXISTS idx_network_nodes_type ON network_nodes(asset_type);
CREATE INDEX IF NOT EXISTS idx_network_nodes_geom ON network_nodes USING GIST(geom);

-- Network Connectivity Edges (Graph Traversal)
CREATE TABLE IF NOT EXISTS network_edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_node VARCHAR(50) NOT NULL REFERENCES network_nodes(asset_id) ON DELETE CASCADE,
    to_node VARCHAR(50) NOT NULL REFERENCES network_nodes(asset_id) ON DELETE CASCADE,
    edge_asset_id VARCHAR(50),
    edge_type VARCHAR(50) NOT NULL, -- POWER_LINE, LV_SEGMENT, SERVICE_DROP
    status VARCHAR(30) DEFAULT 'CLOSED', -- CLOSED, OPEN, FAULTED
    length_m NUMERIC(10, 2) DEFAULT 0,
    direction VARCHAR(30) DEFAULT 'UPSTREAM_TO_DOWNSTREAM',
    properties JSONB DEFAULT '{}'::jsonb,
    geom GEOMETRY(Geometry, 4326),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_network_edges_from ON network_edges(from_node);
CREATE INDEX IF NOT EXISTS idx_network_edges_to ON network_edges(to_node);
CREATE INDEX IF NOT EXISTS idx_network_edges_geom ON network_edges USING GIST(geom);

-- Smart Meters
CREATE TABLE IF NOT EXISTS meters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meter_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    meter_type VARCHAR(50) DEFAULT 'SMART_PREPAID',
    status VARCHAR(30) DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, OUTAGE, DISCONNECTED, UNKNOWN
    installation_date DATE DEFAULT CURRENT_DATE,
    network_node_id VARCHAR(50) REFERENCES network_nodes(asset_id),
    transformer_id VARCHAR(50) REFERENCES network_nodes(asset_id),
    feeder_id VARCHAR(50) REFERENCES network_nodes(asset_id),
    service_point_id VARCHAR(50),
    geom GEOMETRY(Point, 4326) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_meters_number ON meters(meter_number);
CREATE INDEX IF NOT EXISTS idx_meters_transformer ON meters(transformer_id);
CREATE INDEX IF NOT EXISTS idx_meters_feeder ON meters(feeder_id);
CREATE INDEX IF NOT EXISTS idx_meters_geom ON meters USING GIST(geom);

-- Meter Network Connection Table
CREATE TABLE IF NOT EXISTS meter_network_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meter_id UUID REFERENCES meters(id) ON DELETE CASCADE,
    network_asset_id VARCHAR(50) REFERENCES network_nodes(asset_id) ON DELETE CASCADE,
    network_asset_type VARCHAR(50) NOT NULL,
    connection_type VARCHAR(50) DEFAULT 'LV_SERVICE',
    upstream_asset_id VARCHAR(50),
    downstream_asset_id VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    effective_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    effective_to TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Meter Telemetry Readings
CREATE TABLE IF NOT EXISTS meter_readings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meter_id UUID REFERENCES meters(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    voltage_v NUMERIC(6, 2),
    current_a NUMERIC(6, 2),
    active_power_kw NUMERIC(8, 3),
    energy_kwh NUMERIC(12, 2),
    status VARCHAR(30) DEFAULT 'NORMAL' -- NORMAL, OUTAGE, VOLTAGE_ANOMALY, OFFLINE
);

CREATE INDEX IF NOT EXISTS idx_meter_readings_meter_time ON meter_readings(meter_id, timestamp DESC);

-- Faults
CREATE TABLE IF NOT EXISTS faults (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fault_number VARCHAR(50) UNIQUE NOT NULL,
    asset_id VARCHAR(50) REFERENCES network_nodes(asset_id),
    asset_type VARCHAR(50) NOT NULL,
    asset_name VARCHAR(150),
    fault_type VARCHAR(100) NOT NULL, -- SINGLE_PHASE_GROUND, THREE_PHASE, TRANSFORMER_FAILURE, LINE_BREAK, VEGETATION_INTERFERENCE
    status VARCHAR(30) DEFAULT 'ACTIVE', -- ACTIVE, PARTIALLY_RESTORED, RESTORED
    severity VARCHAR(20) DEFAULT 'HIGH', -- LOW, MEDIUM, HIGH, CRITICAL
    priority VARCHAR(20) DEFAULT 'HIGH', -- LOW, MEDIUM, HIGH, CRITICAL
    priority_score NUMERIC(5, 2) DEFAULT 0,
    priority_explanation TEXT,
    total_affected_meters INT DEFAULT 0,
    residential_affected INT DEFAULT 0,
    commercial_affected INT DEFAULT 0,
    industrial_affected INT DEFAULT 0,
    other_affected INT DEFAULT 0,
    total_affected_customers INT DEFAULT 0,
    critical_customers_affected INT DEFAULT 0,
    estimated_revenue_loss_per_day NUMERIC(12, 2) DEFAULT 0,
    fault_location GEOMETRY(Point, 4326),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    restored_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_faults_status ON faults(status);
CREATE INDEX IF NOT EXISTS idx_faults_asset ON faults(asset_id);

-- Fault Affected Meters Detail
CREATE TABLE IF NOT EXISTS fault_affected_meters (
    fault_id UUID REFERENCES faults(id) ON DELETE CASCADE,
    meter_id UUID REFERENCES meters(id) ON DELETE CASCADE,
    status VARCHAR(30) DEFAULT 'AFFECTED', -- AFFECTED, RESTORED
    restored_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fault_id, meter_id)
);

-- Response Crews
CREATE TABLE IF NOT EXISTS crews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    crew_code VARCHAR(30) UNIQUE NOT NULL,
    crew_name VARCHAR(100) NOT NULL,
    lead_name VARCHAR(100) NOT NULL,
    status VARCHAR(30) DEFAULT 'AVAILABLE', -- AVAILABLE, EN_ROUTE, ON_SITE, OFF_DUTY
    contact_phone VARCHAR(50),
    skills TEXT[],
    current_fault_id UUID REFERENCES faults(id),
    geom GEOMETRY(Point, 4326),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Crew Assignments
CREATE TABLE IF NOT EXISTS crew_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fault_id UUID REFERENCES faults(id) ON DELETE CASCADE,
    crew_id UUID REFERENCES crews(id) ON DELETE CASCADE,
    status VARCHAR(30) DEFAULT 'ASSIGNED', -- ASSIGNED, EN_ROUTE, WORKING, COMPLETED
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    estimated_restoration_time TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    routing_distance_km NUMERIC(8, 2),
    routing_geom GEOMETRY(LineString, 4326)
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(100),
    target_id VARCHAR(100),
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
