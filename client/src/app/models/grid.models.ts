export interface User {
  id: string;
  username: string;
  role: 'ADMIN' | 'DISPATCHER' | 'FIELD_ENGINEER' | 'GUEST';
  fullName: string;
}

export interface NetworkNode {
  asset_id: string;
  name: string;
  asset_type: 'SUBSTATION' | 'FEEDER' | 'LINE_SEGMENT' | 'TRANSFORMER' | 'POLE' | 'SWITCH' | 'METER';
  voltage_kv: number;
  status: 'ACTIVE' | 'INACTIVE' | 'FAULTED' | 'MAINTENANCE';
  parent_asset_id?: string;
  properties?: any;
  longitude: number;
  latitude: number;
}

export interface SmartMeter {
  id: string;
  meter_number: string;
  meter_type: string;
  status: 'ACTIVE' | 'OUTAGE' | 'DISCONNECTED' | 'UNKNOWN';
  transformer_id: string;
  feeder_id: string;
  customer_number: string;
  customer_name: string;
  is_critical: boolean;
  critical_reason?: string;
  category_code: string;
  category_name: string;
  longitude: number;
  latitude: number;
}

export interface Fault {
  id: string;
  fault_number: string;
  asset_id: string;
  asset_type: string;
  asset_name: string;
  fault_type: string;
  status: 'ACTIVE' | 'PARTIALLY_RESTORED' | 'RESTORED';
  severity: string;
  priority: string;
  priority_score: number;
  priority_explanation: string;
  total_affected_meters: number;
  residential_affected: number;
  commercial_affected: number;
  industrial_affected: number;
  agricultural_affected?: number;
  government_affected?: number;
  other_affected: number;
  critical_customers_affected: number;
  estimated_revenue_loss_per_day: number;
  longitude: number;
  latitude: number;
  created_at: string;
  restored_at?: string;
}

export interface Crew {
  id: string;
  crew_code: string;
  crew_name: string;
  lead_name: string;
  status: 'AVAILABLE' | 'EN_ROUTE' | 'ON_SITE' | 'OFF_DUTY';
  contact_phone: string;
  skills: string[];
  current_fault_id?: string;
  fault_number?: string;
  asset_name?: string;
  longitude: number;
  latitude: number;
}

export interface AssetIntelligence {
  asset: NetworkNode;
  connectedSubAssets: Record<string, number>;
  customerImpact: {
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
    meters: SmartMeter[];
  };
  riskAssessment: {
    riskScore: number;
    riskLevel: string;
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
  };
}
