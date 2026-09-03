import { db } from '../db/index.js';

export interface FaultImpactSummary {
  faultId?: string;
  assetId: string;
  assetType: string;
  assetName: string;
  affectedMetersCount: number;
  residentialAffected: number;
  commercialAffected: number;
  industrialAffected: number;
  agriculturalAffected: number;
  governmentAffected: number;
  otherAffected: number;
  criticalCustomersAffected: number;
  estimatedRevenueLossPerDay: number;
  priorityScore: number;
  priority: string;
  priorityExplanation: string;
  affectedMetersList: any[];
}

export class FaultImpactService {
  /**
   * Calculates customer impact, revenue loss, and dynamic priority for an asset failure
   */
  static async calculateImpact(assetId: string, customFaultType = 'EQUIPMENT_FAILURE'): Promise<FaultImpactSummary> {
    const nodeRes = await db.query('SELECT asset_id, name, asset_type, voltage_kv, status FROM network_nodes WHERE asset_id = $1', [assetId]);
    if (nodeRes.rows.length === 0) {
      throw new Error(`Asset ${assetId} not found`);
    }

    const asset = nodeRes.rows[0];

    // Get connected meters
    const query = `
      SELECT
        m.id as meter_id,
        m.meter_number,
        m.status,
        c.id as customer_id,
        c.customer_number,
        c.name as customer_name,
        c.is_critical,
        c.critical_reason,
        cc.code as category_code,
        cc.avg_consumption_kwh_day,
        cc.default_tariff_rate
      FROM meters m
      JOIN customers c ON m.customer_id = c.id
      JOIN customer_categories cc ON c.category_id = cc.id
      WHERE m.transformer_id = $1 OR m.feeder_id = $1 OR m.network_node_id = $1
    `;

    const res = await db.query(query, [assetId]);
    let metersList = res.rows;

    // If no direct meter match by ID, check downstream topology graph
    if (metersList.length === 0) {
      const downstreamIds = (await db.query(`
        WITH RECURSIVE downstream AS (
          SELECT to_node FROM network_edges WHERE from_node = $1
          UNION ALL
          SELECT e.to_node FROM network_edges e
          JOIN downstream d ON e.from_node = d.to_node
        )
        SELECT DISTINCT to_node FROM downstream
      `, [assetId])).rows.map(r => r.to_node);

      if (downstreamIds.length > 0) {
        const downstreamMeters = await db.query(`
          SELECT
            m.id as meter_id,
            m.meter_number,
            m.status,
            c.id as customer_id,
            c.customer_number,
            c.name as customer_name,
            c.is_critical,
            c.critical_reason,
            cc.code as category_code,
            cc.avg_consumption_kwh_day,
            cc.default_tariff_rate
          FROM meters m
          JOIN customers c ON m.customer_id = c.id
          JOIN customer_categories cc ON c.category_id = cc.id
          WHERE m.transformer_id = ANY($1) OR m.feeder_id = ANY($1) OR m.network_node_id = ANY($1)
        `, [downstreamIds]);
        metersList = downstreamMeters.rows;
      }
    }

    let residential = 0;
    let commercial = 0;
    let industrial = 0;
    let agricultural = 0;
    let government = 0;
    let other = 0;
    let criticalCount = 0;
    let dailyRevenueLoss = 0;

    metersList.forEach(m => {
      if (m.category_code === 'RESIDENTIAL') residential++;
      else if (m.category_code === 'COMMERCIAL') commercial++;
      else if (m.category_code === 'INDUSTRIAL') industrial++;
      else if (m.category_code === 'AGRICULTURAL') agricultural++;
      else if (m.category_code === 'GOVERNMENT') government++;
      else other++;

      if (m.is_critical) criticalCount++;

      // Revenue loss = daily kWh consumption * tariff rate
      const dailyLoss = parseFloat(m.avg_consumption_kwh_day) * parseFloat(m.default_tariff_rate);
      dailyRevenueLoss += dailyLoss;
    });

    // Dynamic Priority & Risk Score Algorithm
    let score = 0;
    // 1. Customer volume impact
    score += Math.min(metersList.length * 0.5, 30);
    // 2. Critical customer presence
    score += criticalCount * 25;
    // 3. Voltage level weighting
    const voltage = parseFloat(asset.voltage_kv || '0');
    if (voltage >= 132) score += 30;
    else if (voltage >= 33) score += 20;
    else if (voltage >= 11) score += 10;
    // 4. Financial exposure weighting
    score += Math.min((dailyRevenueLoss / 100), 20);

    score = Math.min(Math.round(score * 10) / 10, 100);

    let priority = 'LOW';
    if (score >= 80 || criticalCount >= 1) priority = 'CRITICAL';
    else if (score >= 60) priority = 'HIGH';
    else if (score >= 35) priority = 'MEDIUM';

    const explanation = `Priority ${priority} (Score: ${score}/100) based on ${metersList.length} affected meters, ${criticalCount} critical facilities, $${dailyRevenueLoss.toFixed(2)}/day revenue exposure on ${asset.asset_type} ${asset.asset_id}.`;

    return {
      assetId: asset.asset_id,
      assetType: asset.asset_type,
      assetName: asset.name,
      affectedMetersCount: metersList.length,
      residentialAffected: residential,
      commercialAffected: commercial,
      industrialAffected: industrial,
      agriculturalAffected: agricultural,
      governmentAffected: government,
      otherAffected: other,
      criticalCustomersAffected: criticalCount,
      estimatedRevenueLossPerDay: parseFloat(dailyRevenueLoss.toFixed(2)),
      priorityScore: score,
      priority,
      priorityExplanation: explanation,
      affectedMetersList: metersList,
    };
  }
}
