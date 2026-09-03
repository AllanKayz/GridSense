import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { AuthenticatedRequest, authenticateToken } from '../middleware/auth.js';
import { NetworkTopologyService } from '../services/NetworkTopologyService.js';
import { FaultImpactService } from '../services/FaultImpactService.js';
import { RiskPredictionService } from '../services/RiskPredictionService.js';
import { Server } from 'socket.io';

const JWT_SECRET = process.env.JWT_SECRET || 'gridsense_secret_key_2026';

export function createRouter(io: Server) {
  const router = express.Router();

  // Authentication: Login
  router.post('/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
      const userRes = await db.query('SELECT * FROM users WHERE username = $1', [username]);
      if (userRes.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const user = userRes.rows[0];
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role, fullName: user.full_name },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        token,
        user: { id: user.id, username: user.username, role: user.role, fullName: user.full_name },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/network-nodes - Spatial Query / GIS Assets
  router.get('/network-nodes', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { bbox, type } = req.query;
      let query = `
        SELECT
          asset_id, name, asset_type, voltage_kv, status, parent_asset_id, properties,
          ST_X(geom) as longitude, ST_Y(geom) as latitude,
          ST_AsGeoJSON(geom) as geojson
        FROM network_nodes
      `;
      const conditions: string[] = [];
      const params: any[] = [];

      if (type) {
        params.push(type as string);
        conditions.push(`asset_type = $${params.length}`);
      }

      if (bbox) {
        const parts = (bbox as string).split(',').map(Number);
        if (parts.length === 4) {
          params.push(parts[0], parts[1], parts[2], parts[3]);
          conditions.push(`geom && ST_MakeEnvelope($${params.length - 3}, $${params.length - 2}, $${params.length - 1}, $${params.length}, 4326)`);
        }
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      const result = await db.query(query, params);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/meters - Spatial Bounding Box & Clustering
  router.get('/meters', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { bbox, status, transformer_id, feeder_id } = req.query;
      const userRole = req.user?.role || 'GUEST';
      const isMasked = (userRole === 'GUEST' || userRole === 'FIELD_ENGINEER');
      const nameField = isMasked ? 'c.masked_name as customer_name' : 'c.name as customer_name';

      let query = `
        SELECT
          m.id, m.meter_number, m.meter_type, m.status, m.transformer_id, m.feeder_id, m.network_node_id,
          c.customer_number, ${nameField}, c.is_critical, c.critical_reason,
          cc.code as category_code, cc.name as category_name,
          ST_X(m.geom) as longitude, ST_Y(m.geom) as latitude
        FROM meters m
        JOIN customers c ON m.customer_id = c.id
        JOIN customer_categories cc ON c.category_id = cc.id
      `;

      const conditions: string[] = [];
      const params: any[] = [];

      if (status) {
        params.push(status as string);
        conditions.push(`m.status = $${params.length}`);
      }
      if (transformer_id) {
        params.push(transformer_id as string);
        conditions.push(`m.transformer_id = $${params.length}`);
      }
      if (feeder_id) {
        params.push(feeder_id as string);
        conditions.push(`m.feeder_id = $${params.length}`);
      }
      if (bbox) {
        const parts = (bbox as string).split(',').map(Number);
        if (parts.length === 4) {
          params.push(parts[0], parts[1], parts[2], parts[3]);
          conditions.push(`m.geom && ST_MakeEnvelope($${params.length - 3}, $${params.length - 2}, $${params.length - 1}, $${params.length}, 4326)`);
        }
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' LIMIT 5000';

      const result = await db.query(query, params);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET Asset Intelligence Panel
  router.get('/assets/:id/intelligence', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const assetId = req.params.id as string;
      const userRole = req.user?.role || 'GUEST';

      const assetRes = await db.query('SELECT * FROM network_nodes WHERE asset_id = $1', [assetId]);
      if (assetRes.rows.length === 0) {
        return res.status(404).json({ error: 'Asset not found' });
      }

      const asset = assetRes.rows[0];
      const meterImpact = await NetworkTopologyService.getConnectedMeters(assetId, userRole);
      const riskAssessment = await RiskPredictionService.assessAssetRisk(assetId);

      // Connected sub-asset counts
      const subAssetsRes = await db.query(`
        SELECT asset_type, COUNT(*) as count
        FROM network_nodes
        WHERE parent_asset_id = $1 OR asset_id IN (
          SELECT to_node FROM network_edges WHERE from_node = $1
        )
        GROUP BY asset_type
      `, [assetId]);

      const subAssetsMap: Record<string, number> = {};
      subAssetsRes.rows.forEach(r => subAssetsMap[r.asset_type] = parseInt(r.count));

      res.json({
        asset: {
          id: asset.asset_id,
          name: asset.name,
          type: asset.asset_type,
          voltageKv: asset.voltage_kv,
          status: asset.status,
          parentAssetId: asset.parent_asset_id,
          properties: asset.properties,
        },
        connectedSubAssets: subAssetsMap,
        customerImpact: meterImpact,
        riskAssessment,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/feeders/:id/customer-impact
  router.get('/feeders/:id/customer-impact', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userRole = req.user?.role || 'GUEST';
      const impact = await NetworkTopologyService.getConnectedMeters(req.params.id as string, userRole);
      res.json(impact);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/transformers/:id/customer-impact
  router.get('/transformers/:id/customer-impact', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userRole = req.user?.role || 'GUEST';
      const impact = await NetworkTopologyService.getConnectedMeters(req.params.id as string, userRole);
      res.json(impact);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/network-segments/:id/customer-impact
  router.get('/network-segments/:id/customer-impact', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userRole = req.user?.role || 'GUEST';
      const impact = await NetworkTopologyService.getConnectedMeters(req.params.id as string, userRole);
      res.json(impact);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/poles/:id/meters
  router.get('/poles/:id/meters', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userRole = req.user?.role || 'GUEST';
      const impact = await NetworkTopologyService.getConnectedMeters(req.params.id as string, userRole);
      res.json(impact);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET Network Tree
  router.get('/assets/:id/network-tree', authenticateToken, async (req, res) => {
    try {
      const tree = await NetworkTopologyService.getNetworkTree(req.params.id as string);
      res.json(tree);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/faults - List Active and Historical Faults
  router.get('/faults', authenticateToken, async (req, res) => {
    try {
      const { status } = req.query;
      let query = `
        SELECT
          f.*,
          ST_X(f.fault_location) as longitude,
          ST_Y(f.fault_location) as latitude
        FROM faults f
      `;
      const params: any[] = [];
      if (status) {
        params.push(status as string);
        query += ` WHERE f.status = $1`;
      }
      query += ' ORDER BY f.created_at DESC';

      const result = await db.query(query, params);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/faults/:id/affected-meters
  router.get('/faults/:id/affected-meters', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const faultId = req.params.id as string;
      const userRole = req.user?.role || 'GUEST';
      const isMasked = (userRole === 'GUEST' || userRole === 'FIELD_ENGINEER');
      const nameField = isMasked ? 'c.masked_name as customer_name' : 'c.name as customer_name';

      const query = `
        SELECT
          m.id, m.meter_number, m.meter_type, m.status, m.transformer_id, m.feeder_id,
          c.customer_number, ${nameField}, c.is_critical, c.critical_reason,
          cc.code as category_code, cc.name as category_name,
          ST_X(m.geom) as longitude, ST_Y(m.geom) as latitude
        FROM fault_affected_meters fam
        JOIN meters m ON fam.meter_id = m.id
        JOIN customers c ON m.customer_id = c.id
        JOIN customer_categories cc ON c.category_id = cc.id
        WHERE fam.fault_id = $1
      `;

      const result = await db.query(query, [faultId]);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST Fault Simulator Simulation Endpoint (Before creation)
  router.post('/simulator/analyze', authenticateToken, async (req, res) => {
    try {
      const { assetId, faultType } = req.body;
      const impact = await FaultImpactService.calculateImpact(assetId, faultType);
      res.json(impact);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST Fault Simulator Trigger (Manual or Autonomous creation)
  router.post('/simulator/trigger', authenticateToken, async (req, res) => {
    try {
      const { assetId, faultType = 'EQUIPMENT_FAILURE', mode = 'MANUAL' } = req.body;
      const impact = await FaultImpactService.calculateImpact(assetId, faultType);

      // Get asset location
      const locRes = await db.query('SELECT ST_X(geom) as x, ST_Y(geom) as y, name FROM network_nodes WHERE asset_id = $1', [assetId]);
      if (locRes.rows.length === 0) return res.status(404).json({ error: 'Asset not found' });

      const asset = locRes.rows[0];
      const faultNum = `FD-2026-${Math.floor(10000 + Math.random() * 90000)}`;

      // Insert Fault
      const fRes = await db.query(`
        INSERT INTO faults (
          fault_number, asset_id, asset_type, asset_name, fault_type, status, severity, priority, priority_score, priority_explanation,
          total_affected_meters, residential_affected, commercial_affected, industrial_affected, agricultural_affected, government_affected, other_affected,
          total_affected_customers, critical_customers_affected, estimated_revenue_loss_per_day, fault_location
        ) VALUES (
          $1, $2, $3, $4, $5, 'ACTIVE', $6, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $9, $16, $17, ST_SetSRID(ST_MakePoint($18, $19), 4326)
        ) RETURNING *
      `, [
        faultNum, assetId, impact.assetType, impact.assetName, faultType,
        impact.priority, impact.priorityScore, impact.priorityExplanation,
        impact.affectedMetersCount, impact.residentialAffected, impact.commercialAffected,
        impact.industrialAffected, impact.agriculturalAffected, impact.governmentAffected,
        impact.otherAffected, impact.criticalCustomersAffected, impact.estimatedRevenueLossPerDay,
        asset.x, asset.y
      ]);

      const createdFault = fRes.rows[0];

      // Update Node Status
      await db.query(`UPDATE network_nodes SET status = 'FAULTED' WHERE asset_id = $1`, [assetId]);

      // Update connected meters to OUTAGE
      for (const meter of impact.affectedMetersList) {
        await db.query(`UPDATE meters SET status = 'OUTAGE' WHERE id = $1`, [meter.meter_id]);
        await db.query(`INSERT INTO fault_affected_meters (fault_id, meter_id, status) VALUES ($1, $2, 'AFFECTED') ON CONFLICT DO NOTHING`, [createdFault.id, meter.meter_id]);
      }

      // Broadcast WebSocket event
      io.emit('fault:created', {
        fault: createdFault,
        impact,
        mode,
      });

      res.status(201).json({ fault: createdFault, impact });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v1/faults/:id/restore - Real-time Outage Restoration
  router.post('/faults/:id/restore', authenticateToken, async (req, res) => {
    try {
      const faultId = req.params.id as string;
      const { status = 'RESTORED' } = req.body; // PARTIALLY_RESTORED or RESTORED

      const fRes = await db.query('SELECT * FROM faults WHERE id = $1', [faultId]);
      if (fRes.rows.length === 0) return res.status(404).json({ error: 'Fault not found' });

      const fault = fRes.rows[0];

      if (status === 'RESTORED') {
        await db.query(`UPDATE faults SET status = 'RESTORED', restored_at = CURRENT_TIMESTAMP WHERE id = $1`, [faultId]);
        await db.query(`UPDATE network_nodes SET status = 'ACTIVE' WHERE asset_id = $1`, [fault.asset_id]);

        // Restore connected meters
        const affectedMeters = await db.query('SELECT meter_id FROM fault_affected_meters WHERE fault_id = $1', [faultId]);
        for (const m of affectedMeters.rows) {
          await db.query(`UPDATE meters SET status = 'ACTIVE' WHERE id = $1`, [m.meter_id]);
          await db.query(`UPDATE fault_affected_meters SET status = 'RESTORED', restored_at = CURRENT_TIMESTAMP WHERE fault_id = $1 AND meter_id = $2`, [faultId, m.meter_id]);
        }
      }

      io.emit('fault:restored', { faultId, status, assetId: fault.asset_id });
      res.json({ message: `Fault ${fault.fault_number} status updated to ${status}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/crews - Response Crews & Dispatch
  router.get('/crews', authenticateToken, async (req, res) => {
    try {
      const result = await db.query(`
        SELECT
          c.*,
          ST_X(c.geom) as longitude,
          ST_Y(c.geom) as latitude,
          f.fault_number, f.asset_name
        FROM crews c
        LEFT JOIN faults f ON c.current_fault_id = f.id
      `);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v1/crews/:id/assign
  router.post('/crews/:id/assign', authenticateToken, async (req, res) => {
    try {
      const crewId = req.params.id as string;
      const { faultId } = req.body;

      await db.query(`UPDATE crews SET current_fault_id = $1, status = 'EN_ROUTE' WHERE id = $2`, [faultId, crewId]);
      await db.query(`
        INSERT INTO crew_assignments (fault_id, crew_id, status)
        VALUES ($1, $2, 'EN_ROUTE')
      `, [faultId, crewId]);

      io.emit('crew:assigned', { crewId, faultId });
      res.json({ message: 'Crew assigned successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/analytics/hotspots
  router.get('/analytics/hotspots', authenticateToken, async (req, res) => {
    try {
      const metric = (req.query.metric as string) || 'customer_impact';
      const hotspots = await RiskPredictionService.getHotspots(metric);
      res.json(hotspots);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST Customer/Meter GIS Import Endpoint
  router.post('/admin/import-meters', authenticateToken, async (req, res) => {
    try {
      const { records } = req.body; // Array of meter import records
      if (!Array.isArray(records)) {
        return res.status(400).json({ error: 'Expected records array' });
      }

      let received = records.length;
      let imported = 0;
      let duplicates = 0;
      let invalidGeom = 0;
      let missingTransformer = 0;

      for (const rec of records) {
        if (!rec.latitude || !rec.longitude || isNaN(rec.latitude) || isNaN(rec.longitude)) {
          invalidGeom++;
          continue;
        }

        // Check transformer existence
        if (rec.transformer_id) {
          const tfCheck = await db.query('SELECT asset_id FROM network_nodes WHERE asset_id = $1 AND asset_type = $2', [rec.transformer_id, 'TRANSFORMER']);
          if (tfCheck.rows.length === 0) {
            missingTransformer++;
          }
        }

        // Check duplicate
        const dupCheck = await db.query('SELECT id FROM meters WHERE meter_number = $1', [rec.meter_id]);
        if (dupCheck.rows.length > 0) {
          duplicates++;
          continue;
        }

        // Insert customer
        const categoryCode = rec.category || 'RESIDENTIAL';
        const catRes = await db.query('SELECT id FROM customer_categories WHERE code = $1', [categoryCode]);
        const catId = catRes.rows[0]?.id;

        const custRes = await db.query(`
          INSERT INTO customers (customer_number, name, masked_name, category_id)
          VALUES ($1, $2, $3, $4) RETURNING id
        `, [`CUST-${rec.meter_id}`, `Customer ${rec.meter_id}`, `CUST*** ${rec.meter_id}`, catId]);

        const customerId = custRes.rows[0].id;

        // Insert meter
        await db.query(`
          INSERT INTO meters (meter_number, customer_id, transformer_id, feeder_id, status, geom)
          VALUES ($1, $2, $3, $4, 'ACTIVE', ST_SetSRID(ST_MakePoint($5, $6), 4326))
        `, [rec.meter_id, customerId, rec.transformer_id, rec.feeder_id || 'JURU-03', parseFloat(rec.longitude), parseFloat(rec.latitude)]);

        imported++;
      }

      res.json({
        report: {
          recordsReceived: received,
          imported,
          duplicates,
          invalidGeometry: invalidGeom,
          missingTransformer,
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
