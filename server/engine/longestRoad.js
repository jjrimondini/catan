// Calcolo della rotta continua più lunga di un giocatore (DFS sui lati).
// Conta iperlinee e astronavi; il passaggio da iperlinea ad astronave è possibile solo
// su un proprio edificio. Un vertice con un edificio o un guardiano avversario interrompe la rete.

export function longestRoad(board, roads, buildings, playerId, { ships = {}, guardians = {} } = {}) {
  const kind = new Map();
  for (const [e, o] of Object.entries(roads)) if (o === playerId) kind.set(Number(e), 'road');
  for (const [e, o] of Object.entries(ships)) if (o === playerId) kind.set(Number(e), 'ship');
  if (kind.size === 0) return 0;

  const blocked = v => {
    const b = buildings[v];
    if (b && b.owner !== playerId) return true;
    const g = guardians[v];
    return !!(g && g.owner !== playerId);
  };
  const ownBuilding = v => buildings[v]?.owner === playerId;

  let best = 0;
  const used = new Set();

  function dfs(vertex, length, cameBy) {
    if (length > best) best = length;
    if (blocked(vertex)) return; // si può arrivare ma non proseguire
    for (const e of board.vertices[vertex].edges) {
      const k = kind.get(e);
      if (!k || used.has(e)) continue;
      if (k !== cameBy && !ownBuilding(vertex)) continue;
      used.add(e);
      const edge = board.edges[e];
      dfs(edge.a === vertex ? edge.b : edge.a, length + 1, k);
      used.delete(e);
    }
  }

  for (const [e, k] of kind) {
    const edge = board.edges[e];
    for (const end of [edge.a, edge.b]) {
      used.add(e);
      dfs(end, 1, k);
      used.delete(e);
    }
  }
  return best;
}
