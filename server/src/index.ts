import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { createRouter } from './routes/api.js';
import { db } from './db/index.js';
import { FaultImpactService } from './services/FaultImpactService.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/v1', createRouter(io));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.json({ status: 'OK', timestamp: result.rows[0].now });
  } catch (err: any) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// Autonomous Simulator Controls
let autonomousInterval: NodeJS.Timeout | null = null;
let isAutonomousActive = false;

app.get('/api/v1/simulator/autonomous-status', (req, res) => {
  res.json({ active: isAutonomousActive });
});

app.post('/api/v1/simulator/autonomous-toggle', (req, res) => {
  const { enable } = req.body;

  if (enable && !isAutonomousActive) {
    isAutonomousActive = true;
    // Run autonomous fault generator every 60 seconds
    autonomousInterval = setInterval(async () => {
      try {
        console.log('🤖 Autonomous Fault Generator evaluating grid risks...');
        // Find an active non-faulted transformer or line segment with risk factors
        const candidatesRes = await db.query(`
          SELECT asset_id, name, asset_type, ST_X(geom) as x, ST_Y(geom) as y
          FROM network_nodes
          WHERE asset_type IN ('TRANSFORMER', 'LINE_SEGMENT') AND status = 'ACTIVE'
          ORDER BY RANDOM() LIMIT 1
        `);

        if (candidatesRes.rows.length > 0) {
          const cand = candidatesRes.rows[0];
          const faultType = cand.asset_type === 'TRANSFORMER' ? 'TRANSFORMER_FAILURE' : 'VEGETATION_INTERFERENCE';
          const impact = await FaultImpactService.calculateImpact(cand.asset_id, faultType);

          const faultNum = `FD-AUTO-${Math.floor(10000 + Math.random() * 90000)}`;
          const fRes = await db.query(`
            INSERT INTO faults (
              fault_number, asset_id, asset_type, asset_name, fault_type, status, severity, priority, priority_score, priority_explanation,
              total_affected_meters, residential_affected, commercial_affected, industrial_affected, agricultural_affected, government_affected, other_affected,
              total_affected_customers, critical_customers_affected, estimated_revenue_loss_per_day, fault_location
            ) VALUES (
              $1, $2, $3, $4, $5, 'ACTIVE', $6, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $9, $16, $17, ST_SetSRID(ST_MakePoint($18, $19), 4326)
            ) RETURNING *
          `, [
            faultNum, cand.asset_id, cand.asset_type, cand.name, faultType,
            impact.priority, impact.priorityScore, impact.priorityExplanation,
            impact.affectedMetersCount, impact.residentialAffected, impact.commercialAffected,
            impact.industrialAffected, impact.agriculturalAffected, impact.governmentAffected,
            impact.otherAffected, impact.criticalCustomersAffected, impact.estimatedRevenueLossPerDay,
            cand.x, cand.y
          ]);

          const createdFault = fRes.rows[0];
          await db.query(`UPDATE network_nodes SET status = 'FAULTED' WHERE asset_id = $1`, [cand.asset_id]);

          for (const m of impact.affectedMetersList) {
            await db.query(`UPDATE meters SET status = 'OUTAGE' WHERE id = $1`, [m.meter_id]);
            await db.query(`INSERT INTO fault_affected_meters (fault_id, meter_id, status) VALUES ($1, $2, 'AFFECTED') ON CONFLICT DO NOTHING`, [createdFault.id, m.meter_id]);
          }

          io.emit('fault:created', { fault: createdFault, impact, mode: 'AUTONOMOUS' });
          console.log(`🤖 Autonomous fault generated: ${faultNum} on ${cand.name}`);
        }
      } catch (e: any) {
        console.error('Autonomous fault generator error:', e.message);
      }
    }, 60000);
  } else if (!enable && isAutonomousActive) {
    isAutonomousActive = false;
    if (autonomousInterval) clearInterval(autonomousInterval);
    autonomousInterval = null;
  }

  res.json({ active: isAutonomousActive });
});

// Socket.io Connection Logic
io.on('connection', (socket) => {
  console.log(`WebSocket client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`WebSocket client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`⚡ GridSense AI Server running on port ${PORT}`);
});
