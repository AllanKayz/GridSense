import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { User, NetworkNode, SmartMeter, Fault, Crew, AssetIntelligence } from '../models/grid.models';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = '/api/v1';
  private socket: Socket;

  public activeUser$ = new BehaviorSubject<User>({
    id: 'user-dispatcher',
    username: 'dispatcher',
    role: 'DISPATCHER',
    fullName: 'Control Room Dispatcher'
  });

  public socketEvents$ = new BehaviorSubject<{ event: string; data: any } | null>(null);

  constructor(private http: HttpClient) {
    this.socket = io('http://localhost:3000');

    this.socket.on('fault:created', (data) => this.socketEvents$.next({ event: 'fault:created', data }));
    this.socket.on('fault:restored', (data) => this.socketEvents$.next({ event: 'fault:restored', data }));
    this.socket.on('crew:assigned', (data) => this.socketEvents$.next({ event: 'crew:assigned', data }));
  }

  get currentUser(): User {
    return this.activeUser$.value;
  }

  setRole(role: 'ADMIN' | 'DISPATCHER' | 'FIELD_ENGINEER' | 'GUEST') {
    const u = { ...this.currentUser, role };
    this.activeUser$.next(u);
  }

  private getAuthHeaders(): { headers: HttpHeaders } {
    // Generate simple token payload encoding the active role for RBAC
    const token = btoa(JSON.stringify({ id: this.currentUser.id, username: this.currentUser.username, role: this.currentUser.role }));
    return {
      headers: new HttpHeaders({
        'Authorization': `Bearer ${token}`
      })
    };
  }

  getNetworkNodes(type?: string, bbox?: string): Observable<NetworkNode[]> {
    let url = `${this.baseUrl}/network-nodes`;
    const params: string[] = [];
    if (type) params.push(`type=${type}`);
    if (bbox) params.push(`bbox=${bbox}`);
    if (params.length) url += `?${params.join('&')}`;
    return this.http.get<NetworkNode[]>(url, this.getAuthHeaders());
  }

  getMeters(status?: string, transformerId?: string, feederId?: string, bbox?: string): Observable<SmartMeter[]> {
    let url = `${this.baseUrl}/meters`;
    const params: string[] = [];
    if (status) params.push(`status=${status}`);
    if (transformerId) params.push(`transformer_id=${transformerId}`);
    if (feederId) params.push(`feeder_id=${feederId}`);
    if (bbox) params.push(`bbox=${bbox}`);
    if (params.length) url += `?${params.join('&')}`;
    return this.http.get<SmartMeter[]>(url, this.getAuthHeaders());
  }

  getAssetIntelligence(assetId: string): Observable<AssetIntelligence> {
    return this.http.get<AssetIntelligence>(`${this.baseUrl}/assets/${assetId}/intelligence`, this.getAuthHeaders());
  }

  getNetworkTree(assetId: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/assets/${assetId}/network-tree`, this.getAuthHeaders());
  }

  getFaults(status?: string): Observable<Fault[]> {
    let url = `${this.baseUrl}/faults`;
    if (status) url += `?status=${status}`;
    return this.http.get<Fault[]>(url, this.getAuthHeaders());
  }

  getFaultAffectedMeters(faultId: string): Observable<SmartMeter[]> {
    return this.http.get<SmartMeter[]>(`${this.baseUrl}/faults/${faultId}/affected-meters`, this.getAuthHeaders());
  }

  getCrews(): Observable<Crew[]> {
    return this.http.get<Crew[]>(`${this.baseUrl}/crews`, this.getAuthHeaders());
  }

  assignCrew(crewId: string, faultId: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/crews/${crewId}/assign`, { faultId }, this.getAuthHeaders());
  }

  analyzeSimulation(assetId: string, faultType: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/simulator/analyze`, { assetId, faultType }, this.getAuthHeaders());
  }

  triggerSimulation(assetId: string, faultType: string, mode: string = 'MANUAL'): Observable<any> {
    return this.http.post(`${this.baseUrl}/simulator/trigger`, { assetId, faultType, mode }, this.getAuthHeaders());
  }

  restoreFault(faultId: string, status = 'RESTORED'): Observable<any> {
    return this.http.post(`${this.baseUrl}/faults/${faultId}/restore`, { status }, this.getAuthHeaders());
  }

  getHotspots(metric = 'customer_impact'): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/analytics/hotspots?metric=${metric}`, this.getAuthHeaders());
  }

  importMeters(records: any[]): Observable<any> {
    return this.http.post(`${this.baseUrl}/admin/import-meters`, { records }, this.getAuthHeaders());
  }

  getAutonomousStatus(): Observable<{ active: boolean }> {
    return this.http.get<{ active: boolean }>(`${this.baseUrl}/simulator/autonomous-status`, this.getAuthHeaders());
  }

  toggleAutonomous(enable: boolean): Observable<{ active: boolean }> {
    return this.http.post<{ active: boolean }>(`${this.baseUrl}/simulator/autonomous-toggle`, { enable }, this.getAuthHeaders());
  }
}
