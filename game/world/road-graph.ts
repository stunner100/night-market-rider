import type { RoadGraphData, RoadGraphEdge, RoadGraphNode, WorldPoint } from "./types";

interface QueueNode { id: string; f: number; }

export class RoadGraph {
  private nodes = new Map<string, RoadGraphNode>();
  private adjacency = new Map<string, RoadGraphEdge[]>();

  constructor(data: RoadGraphData) {
    for (const node of data.nodes) this.nodes.set(node.id, node);
    for (const edge of data.edges) {
      const arr = this.adjacency.get(edge.from) ?? [];
      arr.push(edge);
      this.adjacency.set(edge.from, arr);
    }
  }

  get size(): number { return this.nodes.size; }

  nearestNode(x: number, z: number, maxDistance = Infinity): RoadGraphNode | null {
    let best: RoadGraphNode | null = null;
    let bestD2 = maxDistance * maxDistance;
    for (const node of Array.from(this.nodes.values())) {
      const dx = node.x - x;
      const dz = node.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = node; }
    }
    return best;
  }

  route(from: WorldPoint, to: WorldPoint): WorldPoint[] {
    const start = this.nearestNode(from.x, from.z);
    const goal = this.nearestNode(to.x, to.z);
    if (!start || !goal) return [from, to];
    if (start.id === goal.id) return [from, { x: start.x, z: start.z }, to];

    const open: QueueNode[] = [{ id: start.id, f: 0 }];
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>([[start.id, 0]]);
    const closed = new Set<string>();

    const h = (id: string) => {
      const n = this.nodes.get(id)!;
      return Math.hypot(goal.x - n.x, goal.z - n.z);
    };

    while (open.length) {
      let bestIndex = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bestIndex].f) bestIndex = i;
      const current = open.splice(bestIndex, 1)[0].id;
      if (current === goal.id) break;
      if (closed.has(current)) continue;
      closed.add(current);

      for (const edge of this.adjacency.get(current) ?? []) {
        if (closed.has(edge.to)) continue;
        const tentative = (gScore.get(current) ?? Infinity) + edge.length;
        if (tentative >= (gScore.get(edge.to) ?? Infinity)) continue;
        cameFrom.set(edge.to, current);
        gScore.set(edge.to, tentative);
        open.push({ id: edge.to, f: tentative + h(edge.to) });
      }
    }

    if (!cameFrom.has(goal.id)) return [from, to];
    const ids: string[] = [goal.id];
    let cur = goal.id;
    while (cur !== start.id) {
      const prev = cameFrom.get(cur);
      if (!prev) return [from, to];
      ids.push(prev);
      cur = prev;
    }
    ids.reverse();
    const route = ids.map(id => {
      const n = this.nodes.get(id)!;
      return { x: n.x, z: n.z };
    });
    return [from, ...route, to];
  }
}
