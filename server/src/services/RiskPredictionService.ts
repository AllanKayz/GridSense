import { db } from '../db/index.js';

export interface AssetRiskAssessment {
  assetId: string;
  assetName: string;
  assetType: string;
  voltageKv: number;
  riskScore: number; // 0 - 100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  failureProbabilityPct: number;
  factors: {
    historicalFailureRate: number;
    assetAgeYears: number;
    connectedMetersCount: number;
    criticalCustomerCount: number;
    revenueExposurePerDay: number;
    weatherRiskFactor: number;
    vegetationRiskFactor: number;
  };
  recommendations: string[];
}

export class RiskPredictionService {
  /**
   * Assesses predictive grid failure risk for an asset
   */
  static async assessAssetRisk(assetId: string): Promise<AssetRiskAssessment> {
    const assetRes = await db.query('SELECT asset_id, name, asset_type, voltage_kv, properties FROM network_nodes WHERE asset_id = $1', [assetId]);
    if (assetRes.rows.length === 0) {
      throw new Error(`Asset ${assetId} not found`);
    }

    const asset = assetRes.rows[0];
    const props = asset.properties || {};

    // 1. Historical failure count
    const historicalRes = await db.query('SELECT COUNT(*) FROM faults WHERE asset_id = $1', [assetId]);
    const historicalFailures = parseInt(historicalRes.rows[0].count || '0');

    // 2. Asset Age
    const installYear = props.installation_year || 2012;
    const currentYear = new Date().getFullYear();
    const assetAge = Math.max(currentYear - installYear, 1);

    // 3. Connected Customers / Meters & Revenue Exposure
    const meterRes = await db.query(`
      SELECT
        COUNT(*) as total_meters,
        SUM(CASE WHEN c.is_critical THEN 1 ELSE 0 END) as critical_count,
        SUM(cc.avg_consumption_kwh_day * cc.default_tariff_rate) as daily_rev
      FROM meters m
      JOIN customers c ON m.customer_id = c.id
      JOIN customer_categories cc ON c.category_id = cc.id
      WHERE m.transformer_id = $1 OR m.feeder_id = $1 OR m.network_node_id = $1
    `, [assetId]);

    const connectedMeters = parseInt(meterRes.rows[0].total_meters || '0');
    const criticalCustomers = parseInt(meterRes.rows[0].critical_count || '0');
    const dailyRevenue = parseFloat(meterRes.rows[0].daily_rev || '0');

    // Simulated Environmental Factors
    const weatherRisk = 0.35; // Moderate seasonal storm probability
    const vegetationRisk = asset.asset_type === 'LINE_SEGMENT' ? 0.65 : 0.20;

    // AI/ML Predictive Risk Calculation
    let prob = 0.05; // Base 5% probability
    prob += historicalFailures * 0.15;
    prob += (assetAge / 30) * 0.25;
    prob += vegetationRisk * 0.20;
    prob += weatherRisk * 0.15;

    const failureProbability = Math.min(Math.round(prob * 100), 95);

    // Consequence/Impact score
    let impactScore = 0;
    impactScore += Math.min(connectedMeters * 0.5, 40);
    impactScore += criticalCustomers * 20;
    impactScore += Math.min(dailyRevenue / 100, 20);

    // Final Risk Score = Failure Probability * Consequence Weight
    let riskScore = Math.min(Math.round((failureProbability * 0.6) + (impactScore * 0.4)), 100);

    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (riskScore >= 80) riskLevel = 'CRITICAL';
    else if (riskScore >= 60) riskLevel = 'HIGH';
    else if (riskScore >= 35) riskLevel = 'MEDIUM';

    const recommendations = [];
    if (assetAge > 12) recommendations.push('Schedule thermal imaging and insulation testing due to asset age.');
    if (historicalFailures > 2) recommendations.push('Perform immediate protection relay audit (repeat fault history).');
    if (vegetationRisk > 0.5) recommendations.push('Schedule urgent vegetation trimming along OHL corridor.');
    if (criticalCustomers > 0) recommendations.push('Prioritize for automated auto-recloser installation to protect critical loads.');

    return {
      assetId: asset.asset_id,
      assetName: asset.name,
      assetType: asset.asset_type,
      voltageKv: parseFloat(asset.voltage_kv || '0'),
      riskScore,
      riskLevel,
      failureProbabilityPct: failureProbability,
      factors: {
        historicalFailureRate: historicalFailures,
        assetAgeYears: assetAge,
        connectedMetersCount: connectedMeters,
        criticalCustomerCount: criticalCustomers,
        revenueExposurePerDay: parseFloat(dailyRevenue.toFixed(2)),
        weatherRiskFactor: weatherRisk,
        vegetationRiskFactor: vegetationRisk,
      },
      recommendations,
    };
  }

  /**
   * Generates spatial grid hotspot data
   */
  static async getHotspots(metric = 'customer_impact') {
    const query = `
      SELECT
        f.id,
        f.fault_number,
        f.asset_id,
        f.asset_type,
        f.asset_name,
        f.total_affected_meters,
        f.critical_customers_affected,
        f.estimated_revenue_loss_per_day,
        f.priority_score,
        ST_X(f.fault_location) as longitude,
        ST_Y(f.fault_location) as latitude
      FROM faults f
      WHERE f.fault_location IS NOT NULL
    `;

    const res = await db.query(query);
    return res.rows.map(r => ({
      id: r.id,
      assetId: r.asset_id,
      name: r.asset_name,
      longitude: parseFloat(r.longitude),
      latitude: parseFloat(r.latitude),
      intensity: metric === 'revenue_loss' ? parseFloat(r.estimated_revenue_loss_per_day) :
                 metric === 'priority' ? parseFloat(r.priority_score) :
                 parseInt(r.total_affected_meters),
      affectedMeters: parseInt(r.total_affected_meters),
      criticalCount: parseInt(r.critical_customers_affected),
      revenueLoss: parseFloat(r.estimated_revenue_loss_per_day),
    }));
  }
}
