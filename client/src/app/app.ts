import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from './services/api.service';
import { User, NetworkNode, SmartMeter, Fault, Crew, AssetIntelligence } from './models/grid.models';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class AppComponent implements OnInit, OnDestroy {
  activeTab: 'map' | 'dashboard' | 'twin' | 'simulator' | 'hotspot' | 'admin' = 'map';
  currentUser: User = { id: 'u1', username: 'dispatcher', role: 'DISPATCHER', fullName: 'Control Room Dispatcher' };

  private map!: L.Map;
  private assetMarkers: Map<string, L.Layer> = new Map();
  private meterMarkers: L.CircleMarker[] = [];
  private hotspotLayers: L.CircleMarker[] = [];
  private subscriptions: Subscription[] = [];

  // Data state
  nodes: NetworkNode[] = [];
  meters: SmartMeter[] = [];
  faults: Fault[] = [];
  crews: Crew[] = [];
  selectedAssetIntel: AssetIntelligence | null = null;
  selectedFault: Fault | null = null;
  selectedFaultMeters: SmartMeter[] = [];
  networkTreeData: any = null;

  // Layer Visibility Toggles
  showSubstations = true;
  showFeeders = true;
  showLines = true;
  showTransformers = true;
  showPoles = true;
  showMeters = true;
  showFaults = true;

  // Simulator State
  simTargetAssetId = 'T-104';
  simFaultType = 'TRANSFORMER_FAILURE';
  simImpactAnalysis: any = null;
  isAutonomousSim = false;

  // Hotspot State
  hotspotMetric = 'customer_impact';
  hotspotsData: any[] = [];

  // Admin Import State
  importText = '';
  importReport: any = null;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.currentUser = this.api.currentUser;
    this.api.activeUser$.subscribe(u => this.currentUser = u);

    // Subscribe to WebSocket events
    const sub = this.api.socketEvents$.subscribe(evt => {
      if (!evt) return;
      if (evt.event === 'fault:created' || evt.event === 'fault:restored') {
        this.loadFaults();
        this.loadNodesAndMeters();
      }
    });
    this.subscriptions.push(sub);

    this.api.getAutonomousStatus().subscribe(res => this.isAutonomousSim = res.active);
  }

  ngAfterViewInit() {
    if (this.activeTab === 'map') {
      this.initMap();
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  switchTab(tab: 'map' | 'dashboard' | 'twin' | 'simulator' | 'hotspot' | 'admin') {
    this.activeTab = tab;
    if (tab === 'map') {
      setTimeout(() => {
        if (!this.map) this.initMap();
        else {
          this.map.invalidateSize();
          this.loadNodesAndMeters();
        }
      }, 100);
    } else if (tab === 'dashboard') {
      this.loadFaults();
      this.loadCrews();
    } else if (tab === 'twin') {
      this.loadNetworkTree('SUB-01');
    } else if (tab === 'simulator') {
      this.analyzeSimulation();
    } else if (tab === 'hotspot') {
      this.loadHotspots();
    }
  }

  onRoleChange(event: any) {
    const role = event.target.value;
    this.api.setRole(role);
    this.loadNodesAndMeters();
    if (this.selectedAssetIntel) {
      this.selectAsset(this.selectedAssetIntel.asset.asset_id);
    }
  }

  initMap() {
    if (this.map) return;

    // Center on Juru / Goromonzi area (-17.75, 31.15)
    this.map = L.map('map', {
      center: [-17.75, 31.15],
      zoom: 13,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap | GridSense AI Platform'
    }).addTo(this.map);

    this.map.on('moveend zoomend', () => {
      this.loadNodesAndMeters();
    });

    this.loadNodesAndMeters();
    this.loadFaults();
  }

  loadNodesAndMeters() {
    if (!this.map) return;
    const bounds = this.map.getBounds();
    const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
    const zoom = this.map.getZoom();

    // Fetch Network Nodes
    this.api.getNetworkNodes(undefined, bbox).subscribe(nodes => {
      this.nodes = nodes;
      this.renderNetworkNodes();
    });

    // Fetch Smart Meters (if zoom level is high enough for detail e.g. zoom >= 12)
    if (this.showMeters && zoom >= 12) {
      this.api.getMeters(undefined, undefined, undefined, bbox).subscribe(meters => {
        this.meters = meters;
        this.renderMeters();
      });
    } else {
      this.clearMeters();
    }
  }

  renderNetworkNodes() {
    // Clear old markers
    this.assetMarkers.forEach(m => m.remove());
    this.assetMarkers.clear();

    this.nodes.forEach(node => {
      if (node.asset_type === 'SUBSTATION' && !this.showSubstations) return;
      if (node.asset_type === 'FEEDER' && !this.showFeeders) return;
      if (node.asset_type === 'LINE_SEGMENT' && !this.showLines) return;
      if (node.asset_type === 'TRANSFORMER' && !this.showTransformers) return;
      if (node.asset_type === 'POLE' && !this.showPoles) return;

      let color = '#3b82f6';
      let radius = 6;

      if (node.asset_type === 'SUBSTATION') { color = '#a855f7'; radius = 12; }
      else if (node.asset_type === 'FEEDER') { color = '#06b6d4'; radius = 10; }
      else if (node.asset_type === 'TRANSFORMER') { color = node.status === 'FAULTED' ? '#ef4444' : '#f59e0b'; radius = 8; }
      else if (node.asset_type === 'POLE') { color = '#64748b'; radius = 4; }

      const marker = L.circleMarker([node.latitude, node.longitude], {
        radius,
        fillColor: color,
        color: '#ffffff',
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.8
      }).addTo(this.map);

      marker.bindTooltip(`<b>${node.asset_type}</b>: ${node.name} (${node.asset_id})`);
      marker.on('click', () => this.selectAsset(node.asset_id));

      this.assetMarkers.set(node.asset_id, marker);
    });
  }

  renderMeters() {
    this.clearMeters();
    this.meters.forEach(meter => {
      let color = '#10b981'; // Normal active
      if (meter.status === 'OUTAGE') color = '#ef4444'; // Fault outage
      if (meter.is_critical) color = '#f59e0b'; // Critical customer

      const marker = L.circleMarker([meter.latitude, meter.longitude], {
        radius: 3.5,
        fillColor: color,
        color: '#1e293b',
        weight: 0.8,
        fillOpacity: 0.9
      }).addTo(this.map);

      marker.bindTooltip(`
        <div>
          <b>Meter ${meter.meter_number}</b> (${meter.category_name})<br/>
          Client: ${meter.customer_name}<br/>
          Status: <span style="color:${color}">${meter.status}</span>
        </div>
      `);

      this.meterMarkers.push(marker);
    });
  }

  clearMeters() {
    this.meterMarkers.forEach(m => m.remove());
    this.meterMarkers = [];
  }

  loadFaults() {
    this.api.getFaults().subscribe(faults => {
      this.faults = faults;
      if (this.map && this.showFaults) {
        faults.forEach(fault => {
          if (fault.status === 'ACTIVE') {
            const fMarker = L.marker([fault.latitude, fault.longitude], {
              icon: L.divIcon({
                className: 'fault-pulsing-icon',
                html: '<div style="background:#ef4444; width:20px; height:20px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 12px #ef4444;"></div>',
                iconSize: [20, 20]
              })
            }).addTo(this.map);

            fMarker.bindPopup(`
              <div style="color:#000;">
                <h4 style="color:#ef4444; margin:0 0 4px 0;">⚡ FAULT ${fault.fault_number}</h4>
                <b>Asset:</b> ${fault.asset_name}<br/>
                <b>Priority:</b> ${fault.priority} (${fault.priority_score})<br/>
                <b>Affected Meters:</b> ${fault.total_affected_meters}<br/>
                <b>Critical Impact:</b> ${fault.critical_customers_affected}<br/>
                <b>Est. Revenue Loss:</b> $${fault.estimated_revenue_loss_per_day}/day
              </div>
            `);
          }
        });
      }
    });
  }

  selectAsset(assetId: string) {
    this.api.getAssetIntelligence(assetId).subscribe(intel => {
      this.selectedAssetIntel = intel;
      this.selectedFault = null;
    });
  }

  selectFault(fault: Fault) {
    this.selectedFault = fault;
    this.selectedAssetIntel = null;
    this.api.getFaultAffectedMeters(fault.id).subscribe(meters => {
      this.selectedFaultMeters = meters;
    });
    if (this.map) {
      this.map.flyTo([fault.latitude, fault.longitude], 15);
    }
  }

  loadCrews() {
    this.api.getCrews().subscribe(crews => this.crews = crews);
  }

  assignCrew(crewId: string, faultId: string) {
    this.api.assignCrew(crewId, faultId).subscribe(() => {
      this.loadCrews();
      this.loadFaults();
    });
  }

  restoreFault(faultId: string) {
    this.api.restoreFault(faultId, 'RESTORED').subscribe(() => {
      this.selectedFault = null;
      this.loadFaults();
      this.loadNodesAndMeters();
    });
  }

  loadNetworkTree(assetId: string) {
    this.api.getNetworkTree(assetId).subscribe(tree => {
      this.networkTreeData = tree;
    });
  }

  analyzeSimulation() {
    this.api.analyzeSimulation(this.simTargetAssetId, this.simFaultType).subscribe(res => {
      this.simImpactAnalysis = res;
    });
  }

  triggerSimulation() {
    this.api.triggerSimulation(this.simTargetAssetId, this.simFaultType, 'MANUAL').subscribe(res => {
      alert(`Fault Simulation Created: ${res.fault.fault_number}`);
      this.switchTab('map');
      this.selectFault(res.fault);
    });
  }

  toggleAutonomous() {
    this.api.toggleAutonomous(!this.isAutonomousSim).subscribe(res => {
      this.isAutonomousSim = res.active;
    });
  }

  loadHotspots() {
    this.api.getHotspots(this.hotspotMetric).subscribe(data => {
      this.hotspotsData = data;
    });
  }

  submitImport() {
    try {
      const parsed = JSON.parse(this.importText);
      this.api.importMeters(parsed).subscribe(res => {
        this.importReport = res.report;
        this.loadNodesAndMeters();
      });
    } catch (e: any) {
      alert('Invalid JSON input: ' + e.message);
    }
  }

  get activeFaultsCount(): number {
    return this.faults.filter(f => f.status === 'ACTIVE').length;
  }

  get totalAffectedMetersCount(): number {
    return this.faults.filter(f => f.status === 'ACTIVE').reduce((sum, f) => sum + f.total_affected_meters, 0);
  }

  get totalCriticalAffectedCount(): number {
    return this.faults.filter(f => f.status === 'ACTIVE').reduce((sum, f) => sum + f.critical_customers_affected, 0);
  }
}
