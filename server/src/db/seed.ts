import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'gridsense',
  password: process.env.DB_PASSWORD || 'gridsense_pass',
  database: process.env.DB_NAME || 'gridsense_db',
});

async function seed() {
  const client = await pool.connect();

  try {
    console.log('Starting GridSense AI database seed process...');
    await client.query('BEGIN');

    // Clear existing data
    await client.query('TRUNCATE audit_logs, crew_assignments, crews, fault_affected_meters, faults, meter_readings, meter_network_connections, meters, network_edges, network_nodes, users, customers, customer_categories CASCADE');

    // 1. Customer Categories
    console.log('Seeding customer categories...');
    const categoriesResult = await client.query(`
      INSERT INTO customer_categories (code, name, description, avg_consumption_kwh_day, default_tariff_rate) VALUES
      ('RESIDENTIAL', 'Residential Household', 'Single family homes and low voltage apartments', 15.0, 0.14),
      ('COMMERCIAL', 'Commercial Business', 'Retail stores, offices, and commercial establishments', 85.0, 0.22),
      ('INDUSTRIAL', 'Industrial & Factory', 'Manufacturing plants and high-voltage power consumers', 650.0, 0.28),
      ('GOVERNMENT', 'Government & Public Services', 'Government buildings, schools, and civic centers', 180.0, 0.18),
      ('AGRICULTURAL', 'Agricultural & Farming', 'Irrigation pumps, farms, and agro-processing units', 120.0, 0.15),
      ('OTHER', 'Other / Special Tariff', 'Street lighting, temporary connections', 25.0, 0.15)
      RETURNING id, code;
    `);

    const catMap: Record<string, string> = {};
    categoriesResult.rows.forEach(r => catMap[r.code] = r.id);

    // 2. Users (RBAC)
    console.log('Seeding users...');
    const salt = await bcrypt.genSalt(10);
    const passHash = await bcrypt.hash('password123', salt);

    await client.query(`
      INSERT INTO users (username, password_hash, full_name, role) VALUES
      ('admin', $1, 'Administrator User', 'ADMIN'),
      ('dispatcher', $1, 'Control Room Dispatcher', 'DISPATCHER'),
      ('field_eng', $1, 'Field Response Engineer', 'FIELD_ENGINEER'),
      ('guest', $1, 'Guest Viewer', 'GUEST')
    `, [passHash]);

    // 3. Network Nodes (Substations, Feeders, Line Segments, Transformers, Poles, Switches)
    console.log('Seeding network nodes...');

    // Center coordinates around Juru (-17.75, 31.15)
    const baseLat = -17.75;
    const baseLng = 31.15;

    // Substations
    await client.query(`
      INSERT INTO network_nodes (asset_id, name, asset_type, voltage_kv, status, geom) VALUES
      ('SUB-01', 'Juru Main Substation 132/33kV', 'SUBSTATION', 132.0, 'ACTIVE', ST_SetSRID(ST_MakePoint($1, $2), 4326)),
      ('SUB-02', 'Goromonzi Central Substation 132/33kV', 'SUBSTATION', 132.0, 'ACTIVE', ST_SetSRID(ST_MakePoint($1 + 0.08, $2 + 0.08), 4326))
    `, [baseLng, baseLat]);

    // Feeders under SUB-01 and SUB-02
    await client.query(`
      INSERT INTO network_nodes (asset_id, name, asset_type, voltage_kv, status, parent_asset_id, geom) VALUES
      ('JURU-01', 'Juru Feeder 01 (North Industrial)', 'FEEDER', 33.0, 'ACTIVE', 'SUB-01', ST_SetSRID(ST_MakePoint($1 - 0.02, $2 + 0.02), 4326)),
      ('JURU-02', 'Juru Feeder 02 (Township North)', 'FEEDER', 33.0, 'ACTIVE', 'SUB-01', ST_SetSRID(ST_MakePoint($1 + 0.01, $2 - 0.01), 4326)),
      ('JURU-03', 'Juru Feeder 03 (East Urban & Commercial)', 'FEEDER', 33.0, 'ACTIVE', 'SUB-01', ST_SetSRID(ST_MakePoint($1 + 0.03, $2 + 0.01), 4326)),
      ('GORO-01', 'Goromonzi Feeder 01 (Rural South)', 'FEEDER', 33.0, 'ACTIVE', 'SUB-02', ST_SetSRID(ST_MakePoint($1 + 0.09, $2 + 0.07), 4326))
    `, [baseLng, baseLat]);

    // Power Lines / Network Segments
    await client.query(`
      INSERT INTO network_nodes (asset_id, name, asset_type, voltage_kv, status, parent_asset_id, geom) VALUES
      ('LS-JURU03-01', 'Feeder Trunk Segment J3-1', 'LINE_SEGMENT', 33.0, 'ACTIVE', 'JURU-03', ST_SetSRID(ST_MakePoint($1 + 0.032, $2 + 0.012), 4326)),
      ('LS-JURU03-02', 'Feeder Branch Segment J3-2', 'LINE_SEGMENT', 11.0, 'ACTIVE', 'JURU-03', ST_SetSRID(ST_MakePoint($1 + 0.035, $2 + 0.015), 4326)),
      ('LS-JURU03-03', 'Feeder Spur Segment J3-3', 'LINE_SEGMENT', 11.0, 'ACTIVE', 'JURU-03', ST_SetSRID(ST_MakePoint($1 + 0.038, $2 + 0.018), 4326)),
      ('LS-JURU01-01', 'Industrial Line Segment I1-1', 'LINE_SEGMENT', 33.0, 'ACTIVE', 'JURU-01', ST_SetSRID(ST_MakePoint($1 - 0.022, $2 + 0.022), 4326))
    `, [baseLng, baseLat]);

    // Transformers
    await client.query(`
      INSERT INTO network_nodes (asset_id, name, asset_type, voltage_kv, status, parent_asset_id, properties, geom) VALUES
      ('T-101', 'Transformer T-101 11/0.4kV (Juru Industrial)', 'TRANSFORMER', 11.0, 'ACTIVE', 'JURU-01', '{"capacity_kva": 500, "installation_year": 2015}', ST_SetSRID(ST_MakePoint($1 - 0.025, $2 + 0.025), 4326)),
      ('T-102', 'Transformer T-102 11/0.4kV (Township West)', 'TRANSFORMER', 11.0, 'ACTIVE', 'JURU-02', '{"capacity_kva": 315, "installation_year": 2018}', ST_SetSRID(ST_MakePoint($1 + 0.012, $2 - 0.012), 4326)),
      ('T-103', 'Transformer T-103 11/0.4kV (Commercial Center)', 'TRANSFORMER', 11.0, 'ACTIVE', 'JURU-03', '{"capacity_kva": 500, "installation_year": 2012}', ST_SetSRID(ST_MakePoint($1 + 0.033, $2 + 0.013), 4326)),
      ('T-104', 'Transformer T-104 11/0.4kV (Juru Hospital & Residential)', 'TRANSFORMER', 11.0, 'ACTIVE', 'JURU-03', '{"capacity_kva": 630, "installation_year": 2010}', ST_SetSRID(ST_MakePoint($1 + 0.036, $2 + 0.016), 4326)),
      ('T-105', 'Transformer T-105 11/0.4kV (East Residential)', 'TRANSFORMER', 11.0, 'ACTIVE', 'JURU-03', '{"capacity_kva": 315, "installation_year": 2020}', ST_SetSRID(ST_MakePoint($1 + 0.040, $2 + 0.020), 4326)),
      ('T-301', 'Transformer T-301 33/0.4kV (Goromonzi Farm)', 'TRANSFORMER', 33.0, 'ACTIVE', 'GORO-01', '{"capacity_kva": 250, "installation_year": 2019}', ST_SetSRID(ST_MakePoint($1 + 0.095, $2 + 0.075), 4326))
    `, [baseLng, baseLat]);

    // Poles
    const polesData = [];
    for (let i = 1; i <= 12; i++) {
      const pLng = baseLng + 0.036 + (Math.sin(i) * 0.002);
      const pLat = baseLat + 0.016 + (Math.cos(i) * 0.002);
      polesData.push(`('P-${200 + i}', 'Pole P-${200 + i}', 'POLE', 0.4, 'ACTIVE', 'T-104', ST_SetSRID(ST_MakePoint(${pLng}, ${pLat}), 4326))`);
    }
    for (let i = 13; i <= 20; i++) {
      const pLng = baseLng + 0.033 + (Math.sin(i) * 0.002);
      const pLat = baseLat + 0.013 + (Math.cos(i) * 0.002);
      polesData.push(`('P-${200 + i}', 'Pole P-${200 + i}', 'POLE', 0.4, 'ACTIVE', 'T-103', ST_SetSRID(ST_MakePoint(${pLng}, ${pLat}), 4326))`);
    }
    await client.query(`
      INSERT INTO network_nodes (asset_id, name, asset_type, voltage_kv, status, parent_asset_id, geom) VALUES
      ${polesData.join(',\n')}
    `);

    // 4. Network Edges (Graph Topology links)
    console.log('Seeding network graph edges...');

    await client.query(`
      INSERT INTO network_edges (from_node, to_node, edge_asset_id, edge_type, status) VALUES
      ('SUB-01', 'JURU-01', 'BUS-01-01', 'POWER_LINE', 'CLOSED'),
      ('SUB-01', 'JURU-02', 'BUS-01-02', 'POWER_LINE', 'CLOSED'),
      ('SUB-01', 'JURU-03', 'BUS-01-03', 'POWER_LINE', 'CLOSED'),
      ('SUB-02', 'GORO-01', 'BUS-02-01', 'POWER_LINE', 'CLOSED')
    `);

    await client.query(`
      INSERT INTO network_edges (from_node, to_node, edge_asset_id, edge_type, status) VALUES
      ('JURU-03', 'LS-JURU03-01', 'OHL-33KV-01', 'POWER_LINE', 'CLOSED'),
      ('LS-JURU03-01', 'T-103', 'OHL-11KV-01', 'POWER_LINE', 'CLOSED'),
      ('LS-JURU03-01', 'LS-JURU03-02', 'OHL-11KV-02', 'POWER_LINE', 'CLOSED'),
      ('LS-JURU03-02', 'T-104', 'OHL-11KV-03', 'POWER_LINE', 'CLOSED'),
      ('LS-JURU03-02', 'LS-JURU03-03', 'OHL-11KV-04', 'POWER_LINE', 'CLOSED'),
      ('LS-JURU03-03', 'T-105', 'OHL-11KV-05', 'POWER_LINE', 'CLOSED'),
      ('JURU-01', 'LS-JURU01-01', 'OHL-33KV-02', 'POWER_LINE', 'CLOSED'),
      ('LS-JURU01-01', 'T-101', 'OHL-11KV-06', 'POWER_LINE', 'CLOSED'),
      ('JURU-02', 'T-102', 'OHL-11KV-07', 'POWER_LINE', 'CLOSED'),
      ('GORO-01', 'T-301', 'OHL-33KV-03', 'POWER_LINE', 'CLOSED')
    `);

    const poleEdges = [];
    for (let i = 1; i <= 12; i++) {
      poleEdges.push(`('T-104', 'P-${200 + i}', 'LV-LINE-${i}', 'LV_SEGMENT', 'CLOSED')`);
    }
    for (let i = 13; i <= 20; i++) {
      poleEdges.push(`('T-103', 'P-${200 + i}', 'LV-LINE-${i}', 'LV_SEGMENT', 'CLOSED')`);
    }
    await client.query(`
      INSERT INTO network_edges (from_node, to_node, edge_asset_id, edge_type, status) VALUES
      ${poleEdges.join(',\n')}
    `);

    // 5. Customers & Meters Data (~180 meters overall)
    console.log('Seeding customers and spatial smart meters...');

    // Special Critical Customer under T-104: Juru District General Hospital
    const hospCust = await client.query(`
      INSERT INTO customers (customer_number, name, masked_name, category_id, is_critical, critical_reason, contact_email, contact_phone, address)
      VALUES ('CUST-HOSP-01', 'Juru District General Hospital', 'J*** D*** G*** Hospital', $1, TRUE, 'Emergency Medical Facility - Life Support & Trauma Center', 'admin@juruhospital.gov.zw', '+263771234567', 'Plot 14 Juru Expressway')
      RETURNING id;
    `, [catMap['GOVERNMENT']]);
    const hospCustId = hospCust.rows[0].id;

    const hospMeter = await client.query(`
      INSERT INTO meters (meter_number, customer_id, meter_type, status, network_node_id, transformer_id, feeder_id, geom)
      VALUES ('M1000-HOSP', $1, 'SMART_THREE_PHASE', 'ACTIVE', 'P-201', 'T-104', 'JURU-03', ST_SetSRID(ST_MakePoint($2, $3), 4326))
      RETURNING id;
    `, [hospCustId, baseLng + 0.0361, baseLat + 0.0161]);
    const hospMeterId = hospMeter.rows[0].id;

    await client.query(`
      INSERT INTO network_nodes (asset_id, name, asset_type, voltage_kv, status, parent_asset_id, geom)
      VALUES ('M1000-HOSP', 'Smart Meter M1000-HOSP', 'METER', 0.23, 'ACTIVE', 'P-201', ST_SetSRID(ST_MakePoint($1, $2), 4326));
    `, [baseLng + 0.0361, baseLat + 0.0161]);

    await client.query(`
      INSERT INTO network_edges (from_node, to_node, edge_asset_id, edge_type)
      VALUES ('P-201', 'M1000-HOSP', 'SD-HOSP', 'SERVICE_DROP');
    `);

    await client.query(`
      INSERT INTO meter_network_connections (meter_id, network_asset_id, network_asset_type, connection_type, upstream_asset_id)
      VALUES ($1, 'P-201', 'POLE', 'LV_SERVICE', 'T-104');
    `, [hospMeterId]);

    // Additional Customers & Meters
    let meterCount = 1001;
    const tfDistribution = [
      { tf: 'T-104', feeder: 'JURU-03', poleStart: 201, poleCount: 12, count: 60 },
      { tf: 'T-103', feeder: 'JURU-03', poleStart: 213, poleCount: 8, count: 40 },
      { tf: 'T-101', feeder: 'JURU-01', poleStart: 201, poleCount: 1, count: 25 },
      { tf: 'T-102', feeder: 'JURU-02', poleStart: 201, poleCount: 1, count: 30 },
      { tf: 'T-105', feeder: 'JURU-03', poleStart: 201, poleCount: 1, count: 20 },
      { tf: 'T-301', feeder: 'GORO-01', poleStart: 201, poleCount: 1, count: 15 },
    ];

    for (const group of tfDistribution) {
      const tfRes = await client.query('SELECT ST_X(geom) as x, ST_Y(geom) as y FROM network_nodes WHERE asset_id = $1', [group.tf]);
      const tfX = tfRes.rows[0].x;
      const tfY = tfRes.rows[0].y;

      for (let i = 0; i < group.count; i++) {
        const mNum = `M${meterCount++}`;
        const cNum = `CUST-${mNum}`;

        let catCode = 'RESIDENTIAL';
        let isCrit = false;
        let critReason: string | null = null;
        if (i % 12 === 0) catCode = 'COMMERCIAL';
        else if (i % 25 === 0) {
          catCode = 'INDUSTRIAL';
          if (i === 0) {
            isCrit = true;
            critReason = 'Water Pumping & Treatment Facility';
          }
        } else if (i % 18 === 0) catCode = 'AGRICULTURAL';

        const rawName = `${catCode.charAt(0) + catCode.slice(1).toLowerCase()} Customer ${mNum}`;
        const maskedName = `${catCode.substr(0, 3)}*** Client ${mNum.substr(1)}`;

        const cRes = await client.query(`
          INSERT INTO customers (customer_number, name, masked_name, category_id, is_critical, critical_reason, contact_email, contact_phone, address)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
        `, [cNum, rawName, maskedName, catMap[catCode], isCrit, critReason, `client.${mNum.toLowerCase()}@gridsense.internal`, `+26377${Math.floor(100000 + Math.random() * 900000)}`, `Sector ${i % 5 + 1}, Grid Area ${group.tf}`]);

        const customerId = cRes.rows[0].id;

        const jitterX = (Math.random() - 0.5) * 0.005;
        const jitterY = (Math.random() - 0.5) * 0.005;
        const mLng = tfX + jitterX;
        const mLat = tfY + jitterY;

        const assignedPole = `P-${group.poleStart + (i % group.poleCount)}`;

        const mRes = await client.query(`
          INSERT INTO meters (meter_number, customer_id, meter_type, status, network_node_id, transformer_id, feeder_id, geom)
          VALUES ($1, $2, $3, 'ACTIVE', $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326))
          RETURNING id
        `, [mNum, customerId, catCode === 'INDUSTRIAL' ? 'SMART_THREE_PHASE' : 'SMART_PREPAID', assignedPole, group.tf, group.feeder, mLng, mLat]);

        const meterId = mRes.rows[0].id;

        await client.query(`
          INSERT INTO network_nodes (asset_id, name, asset_type, voltage_kv, status, parent_asset_id, geom)
          VALUES ($1, $2, 'METER', 0.23, 'ACTIVE', $3, ST_SetSRID(ST_MakePoint($4, $5), 4326));
        `, [mNum, `Meter Node ${mNum}`, assignedPole, mLng, mLat]);

        await client.query(`
          INSERT INTO network_edges (from_node, to_node, edge_asset_id, edge_type)
          VALUES ($1, $2, $3, 'SERVICE_DROP');
        `, [assignedPole, mNum, `SD-${mNum}`]);

        await client.query(`
          INSERT INTO meter_network_connections (meter_id, network_asset_id, network_asset_type, connection_type, upstream_asset_id)
          VALUES ($1, $2, 'POLE', 'LV_SERVICE', $3);
        `, [meterId, assignedPole, group.tf]);
      }
    }

    // 6. Response Crews
    console.log('Seeding response crews...');
    await client.query(`
      INSERT INTO crews (crew_code, crew_name, lead_name, status, contact_phone, skills, geom) VALUES
      ('ALPHA-1', 'Rapid Response Alpha', 'Eng. T. Moyo', 'AVAILABLE', '+263772111222', ARRAY['HV', 'Transformer Repair', 'Protection'], ST_SetSRID(ST_MakePoint($1 + 0.01, $2 + 0.01), 4326)),
      ('BETA-2', 'Emergency Repair Beta', 'Eng. S. Ndlovu', 'AVAILABLE', '+263772333444', ARRAY['LV Networks', 'Pole Replacement', 'Customer Drops'], ST_SetSRID(ST_MakePoint($1 + 0.04, $2 + 0.02), 4326)),
      ('GAMMA-3', 'Grid Maintenance Gamma', 'Eng. C. Mutasa', 'AVAILABLE', '+263772555666', ARRAY['Substation Maintenance', 'Switching', 'Live Line'], ST_SetSRID(ST_MakePoint($1 - 0.01, $2 - 0.01), 4326))
    `, [baseLng, baseLat]);

    // 7. Active Fault Simulation Seed
    console.log('Seeding active fault scenario...');
    const faultRes = await client.query(`
      INSERT INTO faults (
        fault_number, asset_id, asset_type, asset_name, fault_type, status, severity, priority, priority_score, priority_explanation,
        total_affected_meters, residential_affected, commercial_affected, industrial_affected, other_affected,
        total_affected_customers, critical_customers_affected, estimated_revenue_loss_per_day, fault_location
      ) VALUES (
        'FD-2026-00981', 'T-104', 'TRANSFORMER', 'Transformer T-104 11/0.4kV (Juru Hospital & Residential)',
        'TRANSFORMER_FAILURE', 'ACTIVE', 'CRITICAL', 'CRITICAL', 94.50,
        'Critical hospital facility impacted + 61 connected meters downstream. Urgent dispatch required.',
        61, 52, 6, 2, 1, 61, 2, 4281.50, ST_SetSRID(ST_MakePoint($1 + 0.036, $2 + 0.016), 4326)
      ) RETURNING id;
    `, [baseLng, baseLat]);

    const activeFaultId = faultRes.rows[0].id;

    await client.query(`UPDATE network_nodes SET status = 'FAULTED' WHERE asset_id = 'T-104'`);

    const t104Meters = await client.query(`SELECT id FROM meters WHERE transformer_id = 'T-104'`);
    for (const mRow of t104Meters.rows) {
      await client.query(`UPDATE meters SET status = 'OUTAGE' WHERE id = $1`, [mRow.id]);
      await client.query(`INSERT INTO fault_affected_meters (fault_id, meter_id, status) VALUES ($1, $2, 'AFFECTED')`, [activeFaultId, mRow.id]);
    }

    // Historical Resolved Faults
    await client.query(`
      INSERT INTO faults (
        fault_number, asset_id, asset_type, asset_name, fault_type, status, severity, priority, priority_score,
        total_affected_meters, residential_affected, commercial_affected, industrial_affected, other_affected,
        total_affected_customers, critical_customers_affected, estimated_revenue_loss_per_day, fault_location, restored_at
      ) VALUES
      (
        'FD-2026-00842', 'JURU-02', 'FEEDER', 'Juru Feeder 02', 'VEGETATION_INTERFERENCE', 'RESTORED', 'MEDIUM', 'MEDIUM', 45.0,
        30, 26, 3, 0, 1, 30, 0, 850.00, ST_SetSRID(ST_MakePoint($1 + 0.01, $2 - 0.01), 4326), CURRENT_TIMESTAMP - INTERVAL '3 days'
      ),
      (
        'FD-2026-00711', 'LS-JURU01-01', 'LINE_SEGMENT', 'Industrial Line Segment I1-1', 'SINGLE_PHASE_GROUND', 'RESTORED', 'HIGH', 'HIGH', 78.0,
        25, 5, 2, 18, 0, 25, 1, 3800.00, ST_SetSRID(ST_MakePoint($1 - 0.022, $2 + 0.022), 4326), CURRENT_TIMESTAMP - INTERVAL '7 days'
      )
    `, [baseLng, baseLat]);

    await client.query('COMMIT');
    console.log('Successfully seeded GridSense AI dataset!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding database:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
