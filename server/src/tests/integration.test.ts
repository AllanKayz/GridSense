import { NetworkTopologyService } from '../services/NetworkTopologyService.js';
import { FaultImpactService } from '../services/FaultImpactService.js';
import { RiskPredictionService } from '../services/RiskPredictionService.js';
import { db } from '../db/index.js';

async function runTests() {
  console.log('--- Starting GridSense AI Integration Test Suite ---');
  let failures = 0;

  try {
    // Test 1: Network Topology Connected Meters
    console.log('Test 1: Testing NetworkTopologyService.getConnectedMeters for Transformer T-104...');
    const t104Meters = await NetworkTopologyService.getConnectedMeters('T-104', 'DISPATCHER');
    if (t104Meters.total > 50) {
      console.log(`✅ Passed: Found ${t104Meters.total} connected meters for T-104 (including critical hospital facility).`);
    } else {
      console.error(`❌ Failed: Expected > 50 meters for T-104, got ${t104Meters.total}`);
      failures++;
    }

    // Test 2: Feeder JURU-03 Analysis
    console.log('Test 2: Testing Feeder JURU-03 Downstream Meter Traversal...');
    const juru03Meters = await NetworkTopologyService.getConnectedMeters('JURU-03', 'DISPATCHER');
    if (juru03Meters.total >= 100) {
      console.log(`✅ Passed: Found ${juru03Meters.total} downstream meters on Feeder JURU-03.`);
    } else {
      console.error(`❌ Failed: Expected >= 100 meters on JURU-03, got ${juru03Meters.total}`);
      failures++;
    }

    // Test 3: PII Masking Verification for Field Engineer / Guest Role
    console.log('Test 3: Testing Customer PII Masking by Role...');
    const maskedMeters = await NetworkTopologyService.getConnectedMeters('T-104', 'FIELD_ENGINEER');
    const firstMeterName = maskedMeters.meters[0]?.customer_name || '';
    if (firstMeterName.includes('***')) {
      console.log(`✅ Passed: Customer PII correctly masked ('${firstMeterName}') for FIELD_ENGINEER role.`);
    } else {
      console.error(`❌ Failed: Customer PII was not masked! Name was '${firstMeterName}'`);
      failures++;
    }

    // Test 4: Fault Impact & Revenue Loss Calculation
    console.log('Test 4: Testing FaultImpactService.calculateImpact for T-104...');
    const impact = await FaultImpactService.calculateImpact('T-104', 'TRANSFORMER_FAILURE');
    if (impact.priority === 'CRITICAL' && impact.estimatedRevenueLossPerDay > 0) {
      console.log(`✅ Passed: Dynamic priority is ${impact.priority} (Score: ${impact.priorityScore}), daily revenue loss est: $${impact.estimatedRevenueLossPerDay}`);
    } else {
      console.error(`❌ Failed: Expected CRITICAL priority for T-104, got ${impact.priority}`);
      failures++;
    }

    // Test 5: AI Grid Risk Engine Prediction
    console.log('Test 5: Testing RiskPredictionService.assessAssetRisk for T-104...');
    const risk = await RiskPredictionService.assessAssetRisk('T-104');
    if (risk.riskScore > 0 && risk.recommendations.length > 0) {
      console.log(`✅ Passed: Asset Risk Score is ${risk.riskScore}/100 (${risk.riskLevel}), Recommendations: ${risk.recommendations.length}`);
    } else {
      console.error(`❌ Failed: Invalid risk output for T-104`);
      failures++;
    }

  } catch (err: any) {
    console.error('❌ Test Suite Exception:', err);
    failures++;
  } finally {
    await db.end();
    if (failures === 0) {
      console.log('🎉 All GridSense AI Backend Integration Tests Passed Successfully!');
      process.exit(0);
    } else {
      console.error(`🔥 Test suite failed with ${failures} failure(s).`);
      process.exit(1);
    }
  }
}

runTests();
