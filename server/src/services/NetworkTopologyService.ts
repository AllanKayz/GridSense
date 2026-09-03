import { db } from '../db/index.js';

export interface DownstreamMetersSummary {
  total: number;
  residential: number;
  commercial: number;
  industrial: number;
  agricultural: number;
  government: number;
  other: number;
  active: number;
  outage: number;
  criticalCustomers: number;
  meters: any[];
}

export class NetworkTopologyService {
  /**
   * Traverses network downstream from a given root asset ID using recursive CTE on network_edges
   */
  static async getDownstreamAssetIds(rootAssetId: string): Promise<string[]> {
    const query = `
      WITH RECURSIVE downstream AS (
        SELECT to_node, from_node, 1 as depth
        FROM network_edges
        WHERE from_node = $1

        UNION ALL

        SELECT e.to_node, e.from_node, d.depth + 1
        FROM network_edges e
        INNER JOIN downstream d ON e.from_node = d.to_node
        WHERE d.depth < 15
      )
      SELECT DISTINCT to_node FROM downstream
      UNION
      SELECT $1 as to_node;
    `;

    const res = await db.query(query, [rootAssetId]);
    return res.rows.map(r => r.to_node);
  }

  /**
   * Fetches connected/downstream smart meters for a given asset (Substation, Feeder, Line, Transformer, Pole)
   */
  static async getConnectedMeters(assetId: string, userRole = 'DISPATCHER'): Promise<DownstreamMetersSummary> {
    // 1. Get asset details to check asset_type
    const assetRes = await db.query('SELECT asset_type FROM network_nodes WHERE asset_id = $1', [assetId]);

    let whereClause = '';
    const params: any[] = [];

    if (assetRes.rows.length > 0) {
      const type = assetRes.rows[0].asset_type;
      if (type === 'TRANSFORMER') {
        whereClause = 'WHERE m.transformer_id = $1';
        params.push(assetId);
      } else if (type === 'FEEDER') {
        whereClause = 'WHERE m.feeder_id = $1';
        params.push(assetId);
      } else if (type === 'POLE') {
        whereClause = 'WHERE m.network_node_id = $1';
        params.push(assetId);
      } else {
        // Line segment, substation, or other asset: traverse graph
        const downstreamIds = await this.getDownstreamAssetIds(assetId);
        whereClause = 'WHERE m.transformer_id = ANY($1) OR m.network_node_id = ANY($1) OR m.feeder_id = ANY($1)';
        params.push(downstreamIds);
      }
    } else {
      whereClause = 'WHERE m.transformer_id = $1 OR m.network_node_id = $1 OR m.feeder_id = $1';
      params.push(assetId);
    }

    const isMasked = (userRole === 'GUEST' || userRole === 'FIELD_ENGINEER');
    const nameField = isMasked ? 'c.masked_name as customer_name' : 'c.name as customer_name';

    const query = `
      SELECT
        m.id,
        m.meter_number,
        m.meter_type,
        m.status as meter_status,
        m.transformer_id,
        m.feeder_id,
        m.network_node_id,
        c.customer_number,
        ${nameField},
        c.is_critical,
        c.critical_reason,
        cc.code as category_code,
        cc.name as category_name,
        cc.avg_consumption_kwh_day,
        cc.default_tariff_rate,
        ST_X(m.geom) as longitude,
        ST_Y(m.geom) as latitude
      FROM meters m
      JOIN customers c ON m.customer_id = c.id
      JOIN customer_categories cc ON c.category_id = cc.id
      ${whereClause}
    `;

    const res = await db.query(query, params);
    const rows = res.rows;

    let residential = 0;
    let commercial = 0;
    let industrial = 0;
    let agricultural = 0;
    let government = 0;
    let other = 0;
    let active = 0;
    let outage = 0;
    let criticalCustomers = 0;

    rows.forEach(r => {
      if (r.category_code === 'RESIDENTIAL') residential++;
      else if (r.category_code === 'COMMERCIAL') commercial++;
      else if (r.category_code === 'INDUSTRIAL') industrial++;
      else if (r.category_code === 'AGRICULTURAL') agricultural++;
      else if (r.category_code === 'GOVERNMENT') government++;
      else other++;

      if (r.meter_status === 'ACTIVE') active++;
      else if (r.meter_status === 'OUTAGE') outage++;

      if (r.is_critical) criticalCustomers++;
    });

    return {
      total: rows.length,
      residential,
      commercial,
      industrial,
      agricultural,
      government,
      other,
      active,
      outage,
      criticalCustomers,
      meters: rows,
    };
  }

  /**
   * Generates network tree hierarchy starting from an asset
   */
  static async getNetworkTree(assetId: string): Promise<any> {
    const nodeRes = await db.query('SELECT asset_id, name, asset_type, voltage_kv, status FROM network_nodes WHERE asset_id = $1', [assetId]);
    if (nodeRes.rows.length === 0) return null;

    const root = nodeRes.rows[0];
    const impact = await this.getConnectedMeters(assetId);

    // Get immediate child edges
    const childEdges = await db.query(`
      SELECT e.to_node, n.name, n.asset_type, n.status, n.voltage_kv
      FROM network_edges e
      JOIN network_nodes n ON e.to_node = n.asset_id
      WHERE e.from_node = $1
    `, [assetId]);

    const children = [];
    for (const child of childEdges.rows) {
      if (child.asset_type !== 'METER') {
        const childMeters = await this.getConnectedMeters(child.to_node);
        children.push({
          id: child.to_node,
          name: child.name,
          type: child.asset_type,
          status: child.status,
          voltage_kv: child.voltage_kv,
          connectedMetersCount: childMeters.total,
        });
      }
    }

    return {
      asset: {
        id: root.asset_id,
        name: root.name,
        type: root.asset_type,
        status: root.status,
        voltage_kv: root.voltage_kv,
      },
      customerImpact: {
        total: impact.total,
        residential: impact.residential,
        commercial: impact.commercial,
        industrial: impact.industrial,
        agricultural: impact.agricultural,
        government: impact.government,
        other: impact.other,
        criticalCustomers: impact.criticalCustomers,
      },
      children,
    };
  }
}
