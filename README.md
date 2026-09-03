# GridSense - AI-Powered Fault Detection & Response System for Electrical Grids

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)

## Overview

**GridSense** is an intelligent, real-time fault detection and management system designed for electrical distribution networks. It combines geospatial intelligence, smart meter telemetry, and AI-driven risk prediction to detect faults, assess their impact, prioritize response efforts, and streamline crew dispatch and restoration workflows.

The system provides control room dispatchers, field engineers, and grid operators with actionable insights to minimize outage duration, reduce revenue loss, and optimize customer service during electrical grid faults.

## Key Features

### 🎯 **Real-Time Fault Detection & Analysis**
- Autonomous fault detection on transformers, feeders, line segments, and poles
- Automatic impact assessment calculating affected meters, customer categories, and revenue loss
- Fault priority scoring based on customer criticality and economic impact
- WebSocket-based real-time event broadcasting to all connected operators

### 🗺️ **Geospatial Intelligence**
- Interactive OpenStreetMap-based visualization of electrical grid assets
- Bounding-box based spatial queries for efficient asset filtering
- Network topology traversal using graph-based connectivity models
- PostGIS integration for advanced GIS operations
- Customer privacy masking for role-based data access control

### 📊 **Smart Meter Integration**
- Real-time meter telemetry ingestion (voltage, current, power, energy)
- Customer categorization (residential, commercial, industrial, agricultural, government)
- Automatic meter status updates during faults (ACTIVE → OUTAGE → RESTORED)
- Bulk GIS meter import with validation and conflict detection
- Critical customer tracking and prioritization

### 🧠 **AI-Driven Risk Prediction**
- Asset risk assessment based on historical fault data
- Predictive hotspot identification for preventive maintenance
- Network tree analysis for cascading fault impact modeling
- Revenue loss estimation per affected customer category

### 👥 **Crew Dispatch & Management**
- Real-time crew status tracking (AVAILABLE, EN_ROUTE, ON_SITE, OFF_DUTY)
- Intelligent crew assignment considering fault location and expertise
- Estimated restoration time calculation
- Crew-to-fault relationship tracking

### 🤖 **Fault Simulator (Testing & Training)**
- Manual fault scenario triggering for operator training
- Autonomous fault generator (runs every 60 seconds) for stress testing
- What-if impact analysis before fault creation
- Complete simulation audit trail with mode tracking (MANUAL/AUTONOMOUS)

### 🔐 **Role-Based Access Control**
- Multi-role support: ADMIN, DISPATCHER, FIELD_ENGINEER, GUEST
- Automatic customer name masking for non-privileged users
- JWT-based authentication with 24-hour token expiry
- Audit logging of all system actions

## Architecture

### Technology Stack

**Backend:**
- Node.js + Express.js (API server)
- TypeScript (type-safe implementation)
- PostgreSQL + PostGIS (spatial database)
- Socket.io (real-time WebSocket communication)
- bcryptjs (password hashing)
- jsonwebtoken (JWT authentication)

**Frontend:**
- Angular 21.2 (modern framework)
- TypeScript
- Leaflet + ngx-leaflet (interactive mapping)
- Chart.js (real-time charting)
- RxJS (reactive streams)
- Socket.io-client (WebSocket subscription)

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   CLIENT (Angular Web UI)                    │
│  [Map Tab] [Dashboard] [Digital Twin] [Simulator] [Hotspots] │
└────────────────────┬────────────────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          │ REST API + WebSocket │
          │  (Express.js)        │
          └──────────┬──────────┘
                     │
     ┌───────────────┼───────────────┐
     │               │               │
┌────▼─────┐  ┌─────▼─────┐  ┌──────▼──────┐
│ Services  │  │  Routes   │  │ Middleware  │
│ - Network │  │  - Auth   │  │  - JWT Auth │
│ - Fault   │  │  - Assets │  │  - Logging  │
│ - Risk    │  │  - Faults │  │             │
└────┬─────┘  │  - Crews  │  └─────────────┘
     │        │  - Admin  │
     │        └─────┬─────┘
     │              │
     └──────────────┼──────────────────┐
                    │                  │
            ┌───────▼──────────┐  ┌────▼────────┐
            │   PostgreSQL     │  │   PostGIS   │
            │   Database       │  │  Spatial DB │
            │  - Users         │  │             │
            │  - Network Nodes │  │             │
            │  - Meters        │  │             │
            │  - Faults        │  │             │
            │  - Crews         │  │             │
            └──────────────────┘  └─────────────┘
```

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `users` | System users with roles (ADMIN, DISPATCHER, FIELD_ENGINEER, GUEST) |
| `customers` | Customer accounts with category & criticality flags |
| `customer_categories` | Customer types with consumption & tariff profiles |
| `network_nodes` | Electrical assets (substations, feeders, transformers, poles, etc.) |
| `network_edges` | Connectivity between network nodes (power lines, LV segments) |
| `meters` | Smart meters with telemetry and customer associations |
| `meter_readings` | Time-series telemetry (voltage, current, power) |
| `faults` | Fault records with impact assessment & status tracking |
| `fault_affected_meters` | Junction table linking faults to impacted meters |
| `crews` | Response crews with status & expertise tracking |
| `crew_assignments` | Crew-to-fault dispatch records |
| `audit_logs` | Action audit trail for compliance |

All tables use PostGIS geometry types for spatial operations and include comprehensive indexing for performance.

## Getting Started

### Prerequisites

- **Node.js** 18+ and npm 11+
- **PostgreSQL** 14+ with PostGIS extension
- **Angular CLI** 21.2+
- Git

### Environment Setup

#### 1. Database Setup

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE gridsense;
\c gridsense

# Enable PostGIS extension (PostGIS must be installed)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

# Exit psql
\q
```

#### 2. Seed Database Schema & Data

```bash
cd server
npm install
npm run seed
```

This populates:
- Database schema (tables, indexes, constraints)
- Sample electrical network topology
- Test customers and meters
- Demo user accounts (username: `admin`, password: `password`)

#### 3. Install Backend Dependencies

```bash
cd server
npm install
```

Create `.env` file in the `server` directory:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/gridsense
JWT_SECRET=gridsense_secret_key_2026
PORT=3000
NODE_ENV=development
```

#### 4. Install Frontend Dependencies

```bash
cd client
npm install
```

### Running the Application

#### Start Backend Server

```bash
cd server
npm run dev
```

Server will start on `http://localhost:3000`

Health check: `GET http://localhost:3000/health`

#### Start Frontend Development Server

```bash
cd client
npm start
```

Client will be available at `http://localhost:4200`

**Default credentials:**
- Username: `admin`
- Password: `password`

## API Documentation

### Authentication

#### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "password"
}

Response:
{
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "username": "admin",
    "role": "ADMIN",
    "fullName": "Administrator"
  }
}
```

All subsequent requests must include the token in the `Authorization` header:
```http
Authorization: Bearer <token>
```

### Network Assets

#### Get Network Nodes (Spatial Query)
```http
GET /api/v1/network-nodes?type=TRANSFORMER&bbox=31.0,−17.8,31.2,−17.7
```

Response includes asset ID, name, type, voltage, status, and GeoJSON geometry.

#### Get Connected Meters for Asset
```http
GET /api/v1/assets/:assetId/intelligence

Response:
{
  "asset": { ... },
  "connectedSubAssets": { "TRANSFORMER": 3, "POLE": 12 },
  "customerImpact": { "totalMeters": 45, "residential": 40, "critical": 2 },
  "riskAssessment": { "riskLevel": "HIGH", "failureProbability": 0.15 }
}
```

#### Get Network Topology Tree
```http
GET /api/v1/assets/:assetId/network-tree

Response: Hierarchical tree structure of connected assets
```

### Smart Meters

#### Get Meters (Spatial/Filter Query)
```http
GET /api/v1/meters?bbox=31.0,−17.8,31.2,−17.7&status=ACTIVE&transformer_id=T-104

Response: Array of meter records with customer info and coordinates
```

#### Bulk Import Meters (Admin Only)
```http
POST /api/v1/admin/import-meters
Content-Type: application/json

{
  "records": [
    {
      "meter_id": "MTR-001",
      "latitude": -17.75,
      "longitude": 31.15,
      "transformer_id": "T-104",
      "feeder_id": "JURU-03",
      "category": "RESIDENTIAL"
    },
    ...
  ]
}

Response:
{
  "report": {
    "recordsReceived": 100,
    "imported": 98,
    "duplicates": 1,
    "invalidGeometry": 1,
    "missingTransformer": 0
  }
}
```

### Faults

#### List Faults
```http
GET /api/v1/faults?status=ACTIVE

Response: Array of fault records with location, impact metrics, and status
```

#### Get Fault Affected Meters
```http
GET /api/v1/faults/:faultId/affected-meters

Response: Meters impacted by specific fault (respects role-based name masking)
```

#### Simulate Fault Impact (Pre-Analysis)
```http
POST /api/v1/simulator/analyze
Content-Type: application/json

{
  "assetId": "T-104",
  "faultType": "TRANSFORMER_FAILURE"
}

Response: Impact assessment without creating fault
{
  "assetName": "Main Transformer T-104",
  "assetType": "TRANSFORMER",
  "priority": "CRITICAL",
  "priorityScore": 98.5,
  "affectedMetersCount": 245,
  "residentialAffected": 200,
  "commercialAffected": 40,
  "industrialAffected": 5,
  "criticalCustomersAffected": 3,
  "estimatedRevenueLossPerDay": 4500.00,
  "priorityExplanation": "3 critical customers affected. High revenue impact."
}
```

#### Trigger Fault (Manual Simulation)
```http
POST /api/v1/simulator/trigger
Content-Type: application/json

{
  "assetId": "T-104",
  "faultType": "TRANSFORMER_FAILURE",
  "mode": "MANUAL"
}

Response: Fault record created + impact assessment
```

#### Restore Fault
```http
POST /api/v1/faults/:faultId/restore
Content-Type: application/json

{
  "status": "RESTORED"  // or "PARTIALLY_RESTORED"
}

Response: Fault status updated, all associated meters restored
```

### Crews & Dispatch

#### Get Crews
```http
GET /api/v1/crews

Response: Array of crew records with current assignment and location
```

#### Assign Crew to Fault
```http
POST /api/v1/crews/:crewId/assign
Content-Type: application/json

{
  "faultId": "fault-uuid"
}

Response: Crew status updated to EN_ROUTE
```

### Analytics

#### Get Risk Hotspots
```http
GET /api/v1/analytics/hotspots?metric=customer_impact

Metrics:
  - customer_impact: Areas with highest meter concentration
  - risk_score: Areas with highest fault probability
  - revenue_exposure: Areas with highest revenue at risk

Response: Array of hotspot records with coordinates and risk values
```

### Simulator Controls

#### Get Autonomous Status
```http
GET /api/v1/simulator/autonomous-status

Response: { "active": true }
```

#### Toggle Autonomous Fault Generator
```http
POST /api/v1/simulator/autonomous-toggle
Content-Type: application/json

{
  "enable": true  // Enable autonomous mode (generates fault every 60 seconds)
}

Response: { "active": true }
```

## User Interface Tabs

### 📍 **Map Tab**
- Interactive OpenStreetMap-based grid visualization
- Asset layer toggles (substations, feeders, lines, transformers, poles, meters, faults)
- Real-time fault markers with pulsing animation
- Zoom-aware meter detail loading (visible at zoom 12+)
- Click assets for intelligence panel
- Click faults for impact details

### 📊 **Dashboard Tab**
- Real-time KPIs:
  - Active faults count
  - Total affected meters
  - Critical customers impacted
- Fault list with sortable columns (priority, status, asset, impact)
- Affected meters detail view
- Crew assignment interface
- Restoration status tracking

### 🌐 **Digital Twin Tab**
- Hierarchical network topology tree
- Parent-child asset relationships
- Connected meter counts by asset
- Graph traversal for upstream/downstream impact analysis

### 🤖 **Simulator Tab**
- What-if impact analysis (before creating fault)
- Manual fault creation with type selection
- Autonomous mode toggle (auto-generate faults every 60 seconds)
- Impact visualization showing affected customer categories
- Training scenario library

### 🔴 **Hotspots Tab**
- Metric selection (customer_impact, risk_score, revenue_exposure)
- Geographic hotspot visualization
- Preventive maintenance recommendations
- Historical trend analysis

### ⚙️ **Admin Tab**
- Bulk meter import from JSON
- Import validation report
- User management
- System configuration

## Key Services

### FaultImpactService
Calculates fault impact by:
1. Finding all connected meters via network topology
2. Categorizing affected customers (residential, commercial, industrial, etc.)
3. Identifying critical customer presence
4. Estimating revenue loss using customer tariff rates
5. Assigning priority score (0-100) based on impact severity

### NetworkTopologyService
Provides:
- Connected meter lookup for any asset (respects role-based masking)
- Network tree generation for hierarchical visualization
- Upstream/downstream asset traversal
- Cascading fault impact analysis

### RiskPredictionService
Generates:
- Per-asset risk scores based on historical fault patterns
- Hotspot identification (areas with highest risk concentration)
- Risk categorization (LOW, MEDIUM, HIGH, CRITICAL)
- Predictive failure probability estimates

## Real-Time Features (WebSocket)

### Events Emitted
```javascript
// New fault created
socket.on('fault:created', { fault, impact, mode });

// Fault restored
socket.on('fault:restored', { faultId, status, assetId });

// Crew assigned
socket.on('crew:assigned', { crewId, faultId });
```

All authenticated clients automatically receive these events for operational awareness.

## Security & Privacy

### Authentication
- JWT-based stateless authentication
- 24-hour token expiry
- Password hashing using bcryptjs (10 salt rounds)

### Authorization
- Role-based access control (RBAC) on all API endpoints
- Customer name masking for GUEST and FIELD_ENGINEER roles
- Audit logging of all sensitive actions

### Data Privacy
- PII (customer names) automatically masked based on user role
- Sensitive credentials stored securely (never in logs)
- CORS configured for controlled access

## Development

### Building

**Backend:**
```bash
cd server
npm run build  # Compile TypeScript to JavaScript in dist/
```

**Frontend:**
```bash
cd client
npm run build  # Production build in dist/
```

### Testing

**Backend Unit Tests:**
```bash
cd server
npm test
```

**Frontend Unit Tests:**
```bash
cd client
npm test
```

**Frontend E2E Tests:**
```bash
cd client
npm run e2e
```

### Code Quality

- **Client:** Prettier formatting (`npm run format`)
- **Server:** TypeScript strict mode enabled
- **Database:** PostGIS spatial indexing for performance

## Deployment

### Production Build & Run

```bash
# Backend
cd server
npm run build
npm start  # Runs dist/index.js on port 3000

# Frontend (from dist/ served by web server)
cd client
npm run build
# Serve dist/ folder via nginx/apache/CDN
```

### Environment Variables

**Server (.env):**
```env
DATABASE_URL=postgresql://user:pass@host:5432/gridsense
JWT_SECRET=your-secure-random-string
PORT=3000
NODE_ENV=production
```

**Client (environment.prod.ts):**
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://api.gridsense.example.com',
};
```

## Performance Considerations

### Database Optimization
- Spatial indexes on GIS columns (GIST indices)
- Composite indexes on frequently queried columns
- Query result pagination/limiting
- Prepared statements with parameterized queries

### Frontend Optimization
- Lazy loading of map tiles (OpenStreetMap)
- Zoom-based meter visibility (only load detail at zoom 12+)
- WebSocket for efficient real-time updates (vs polling)
- Angular change detection optimized for standalone components

### Scalability
- Stateless API design (horizontal scaling-ready)
- Database connection pooling
- WebSocket namespace segregation by region (future enhancement)

## Troubleshooting

### Database Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution:** Ensure PostgreSQL is running and DATABASE_URL is correct.

### PostGIS Extension Error
```
ERROR: extension "postgis" does not exist
```
**Solution:** Install PostGIS on your PostgreSQL instance:
```bash
sudo apt-get install postgresql-14-postgis-3  # Ubuntu
brew install postgis  # macOS
```

### Map Not Loading
```
Map div not rendering
```
**Solution:** Ensure `ngAfterViewInit()` is called and map container exists in DOM.

### WebSocket Connection Issues
```
io.emit not reaching clients
```
**Solution:** Check CORS configuration and ensure Socket.io client version matches server version.

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see LICENSE file for details.

## Roadmap

- [ ] Mobile app (React Native)
- [ ] AI model integration for fault prediction
- [ ] Multi-region support with geographically distributed crews
- [ ] Historical analytics dashboard
- [ ] Integration with SCADA systems
- [ ] SMS/Email alerting for critical events
- [ ] Machine learning-based crew routing optimization
- [ ] Advanced power flow simulation

## Support

For issues, questions, or feature requests, please open a GitHub issue or contact the development team.

## Authors

**Allan Kayz** - Initial development and architecture

## Acknowledgments

- OpenStreetMap for base maps
- PostGIS for spatial database capabilities
- Angular and Leaflet communities for excellent frameworks
