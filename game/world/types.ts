export type WorldPoint = { x: number; z: number };

export interface WorldRoad {
  id: string;
  osmId?: number;
  highway: string;
  name?: string | null;
  width: number;
  oneWay?: boolean;
  surface?: string | null;
  points: WorldPoint[];
  tags?: Record<string, string>;
}

export interface WorldBuilding {
  id: string;
  osmId?: number;
  height: number;
  footprint: WorldPoint[];
  tags?: Record<string, string>;
}

export interface WorldPoi {
  id: string;
  osmId?: number;
  x: number;
  z: number;
  tags?: Record<string, string>;
}

export interface WorldChunk {
  key: string;
  cx: number;
  cz: number;
  roads: WorldRoad[];
  buildings: WorldBuilding[];
  pois: WorldPoi[];
}

export interface WorldManifest {
  version: number;
  generatedAt: string;
  source: string;
  attribution: string;
  license: string;
  origin: { lat: number; lon: number; name?: string };
  bbox: { south: number; west: number; north: number; east: number };
  chunkSize: number;
  counts: {
    roads: number;
    buildings: number;
    pois: number;
    graphNodes: number;
    graphEdges: number;
  };
  chunks: Array<{ key: string; cx: number; cz: number; roads: number; buildings: number; pois: number }>;
}

export interface RoadGraphNode {
  id: string;
  x: number;
  z: number;
}

export interface RoadGraphEdge {
  id: string;
  from: string;
  to: string;
  length: number;
  roadId: string;
  highway: string;
}

export interface RoadGraphData {
  nodes: RoadGraphNode[];
  edges: RoadGraphEdge[];
}

export interface GeographicLocation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  x: number;
  z: number;
  kind: string;
}
