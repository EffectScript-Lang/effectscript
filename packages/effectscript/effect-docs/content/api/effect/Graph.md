# effect/Graph

The examples in the JSDoc of `packages/effect/src/Graph.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## fromSnapshot

**Preserving graph indexes**

```efx
import { Graph } from "effect"

const graph = Graph.fromSnapshot({
  type: "directed",
  nodes: [{ index: 2, data: "A" }, { index: 5, data: "B" }],
  edges: [{ index: 3, source: 2, target: 5, data: 1 }]
})

Graph.toSnapshot(graph).edges[0].index // => 3
```

## toSnapshot

**Round-tripping a graph snapshot**

```efx
import { Equal, Graph } from "effect"

const graph = Graph.fromSnapshot({
  type: "undirected",
  nodes: [{ index: 2, data: "A" }, { index: 5, data: "B" }],
  edges: [{ index: 3, source: 5, target: 2, data: "A-B" }]
})

Equal.equals(Graph.fromSnapshot(Graph.toSnapshot(graph)), graph) // => true
```

## make

**Constructing by kind**

```efx
import { Graph } from "effect"

const makeGraph = Graph.make("directed")
const graph = makeGraph<string, number>((mutable) => {
  Graph.addNode(mutable, "A")
})

graph.type // => "directed"
```

## directed

**Creating a directed graph**

```efx
import { Graph } from "effect"

// Directed graph with initial nodes and edges
const graph = Graph.directed<string, string>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, "A->B")
  Graph.addEdge(mutable, b, c, "B->C")
})
Array.of(Graph.nodeCount(graph), Graph.edgeCount(graph)) // => [3, 2]
```

## undirected

**Creating an undirected graph**

```efx
import { Graph } from "effect"

// Undirected graph with initial nodes and edges
const graph = Graph.undirected<string, string>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, "A-B")
  Graph.addEdge(mutable, b, c, "B-C")
})
Array.of(Graph.nodeCount(graph), Graph.edgeCount(graph)) // => [3, 2]
```

## beginMutation

**Beginning a mutation scope**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>()
const mutable = Graph.beginMutation(graph)
// Now mutable can be safely modified without affecting original graph
Array.of(Graph.nodeCount(mutable), Graph.nodeCount(graph)) // => [0, 0]
```

## endMutation

**Ending a mutation scope**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>()
const mutable = Graph.beginMutation(graph)
// ... perform mutations on mutable ...
Graph.nodeCount(Graph.endMutation(mutable)) // => 0
```

## mutate

**Applying scoped mutations**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>()
const newGraph = Graph.mutate(graph, (mutable) => {
  const nodeA = Graph.addNode(mutable, "A")
  const nodeB = Graph.addNode(mutable, "B")
  Graph.addEdge(mutable, nodeA, nodeB, 1)
})

Graph.nodeCount(newGraph) // => 2
Graph.edgeCount(newGraph) // => 1
```

## compose

**Combining graphs**

```efx
import { Graph } from "effect"

const left = Graph.directed<{ id: string }, string>((mutable) => {
  const a = Graph.addNode(mutable, { id: "A" })
  const b = Graph.addNode(mutable, { id: "B" })
  Graph.addEdge(mutable, a, b, "A-B")
})

const right = Graph.directed<{ id: string }, string>((mutable) => {
  const b = Graph.addNode(mutable, { id: "B" })
  const c = Graph.addNode(mutable, { id: "C" })
  Graph.addEdge(mutable, b, c, "B-C")
})

const result = Graph.compose(left, right, {
  nodeIdentity: (node) => node.id
})

Graph.nodeCount(result) // => 3
Graph.edgeCount(result) // => 2
```

## intersection

**Finding shared structure**

```efx
import { Graph } from "effect"

const left = Graph.directed<string, string>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  Graph.addEdge(mutable, a, b, "shared")
})

const right = Graph.directed<string, string>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  Graph.addEdge(mutable, a, b, "shared")
})

const result = Graph.intersection(left, right)

Graph.nodeCount(result) // => 2
Graph.edgeCount(result) // => 1
```

## difference

**Removing shared edges**

```efx
import { Graph } from "effect"

const left = Graph.directed<string, string>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, "A-B")
  Graph.addEdge(mutable, b, c, "B-C")
})

const right = Graph.directed<string, string>((mutable) => {
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, b, c, "B-C")
})

const result = Graph.difference(left, right)

Graph.nodeCount(result) // => 3
Graph.edgeCount(result) // => 1
```

## symmetricDifference

**Finding differing edges**

```efx
import { Graph } from "effect"

const left = Graph.directed<string, string>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, "A-B")
  Graph.addEdge(mutable, b, c, "B-C")
})

const right = Graph.directed<string, string>((mutable) => {
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  const d = Graph.addNode(mutable, "D")
  Graph.addEdge(mutable, b, c, "B-C")
  Graph.addEdge(mutable, c, d, "C-D")
})

const result = Graph.symmetricDifference(left, right)

Graph.nodeCount(result) // => 4
Graph.edgeCount(result) // => 2
```

## complement

**Finding missing relationships**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, string>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  Graph.addEdge(mutable, a, b, "A-B")
})

const result = Graph.complement(graph, (source, target) => `${source}-${target}`)

Graph.edgeCount(result) // => 1
```

## neighborhood

**Getting a local neighborhood**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, string>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, "A-B")
  Graph.addEdge(mutable, b, c, "B-C")
})

const result = Graph.neighborhood(graph, 1, { radius: 1 })

Graph.nodeCount(result) // => 2
```

## addNode

**Adding nodes**

```efx
import { Graph } from "effect"

Graph.mutate(Graph.directed<string, number>(), (mutable) => {
  Graph.addNode(mutable, "Node A") // => 0
  Graph.addNode(mutable, "Node B") // => 1
})
```

## getNode

**Getting node data**

```efx
import { Graph, Option } from "effect"

const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
  Graph.addNode(mutable, "Node A")
})

Graph.getNode(graph, 0) // => Option.some("Node A")
```

## hasNode

**Checking node existence**

```efx
import { Graph } from "effect"

const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
  Graph.addNode(mutable, "Node A")
})

Graph.hasNode(graph, 0) // => true
Graph.hasNode(graph, 999) // => false
```

## nodeCount

**Counting nodes**

```efx
import { Graph } from "effect"

const emptyGraph = Graph.directed<string, number>()
Graph.nodeCount(emptyGraph) // => 0

const graphWithNodes = Graph.mutate(emptyGraph, (mutable) => {
  Graph.addNode(mutable, "Node A")
  Graph.addNode(mutable, "Node B")
  Graph.addNode(mutable, "Node C")
})

Graph.nodeCount(graphWithNodes) // => 3
```

## findNode

**Finding the first matching node**

```efx
import { Graph, Option } from "effect"

const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
  Graph.addNode(mutable, "Node A")
  Graph.addNode(mutable, "Node B")
  Graph.addNode(mutable, "Node C")
})

Graph.findNode(graph, (data) => data.startsWith("Node B")) // => Option.some(1)
Graph.findNode(graph, (data) => data === "Node D") // => Option.none()
```

## findNodes

**Finding matching nodes**

```efx
import { Graph } from "effect"

const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
  Graph.addNode(mutable, "Start A")
  Graph.addNode(mutable, "Node B")
  Graph.addNode(mutable, "Start C")
})

Graph.findNodes(graph, (data) => data.startsWith("Start")) // => [0, 2]
Graph.findNodes(graph, (data) => data === "Not Found") // => []
```

## findEdge

**Finding the first matching edge**

```efx
import { Graph, Option } from "effect"

const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
  const nodeA = Graph.addNode(mutable, "Node A")
  const nodeB = Graph.addNode(mutable, "Node B")
  const nodeC = Graph.addNode(mutable, "Node C")
  Graph.addEdge(mutable, nodeA, nodeB, 10)
  Graph.addEdge(mutable, nodeB, nodeC, 20)
})

Graph.findEdge(graph, (data) => data > 15) // => Option.some(1)
Graph.findEdge(graph, (data) => data > 100) // => Option.none()
```

## findEdges

**Finding matching edges**

```efx
import { Graph } from "effect"

const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
  const nodeA = Graph.addNode(mutable, "Node A")
  const nodeB = Graph.addNode(mutable, "Node B")
  const nodeC = Graph.addNode(mutable, "Node C")
  Graph.addEdge(mutable, nodeA, nodeB, 10)
  Graph.addEdge(mutable, nodeB, nodeC, 20)
  Graph.addEdge(mutable, nodeC, nodeA, 30)
})

Graph.findEdges(graph, (data) => data >= 20) // => [1, 2]
Graph.findEdges(graph, (data) => data > 100) // => []
```

## updateNode

**Updating node data**

```efx
import { Graph, Option } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  Graph.addNode(mutable, "Node A")
  Graph.addNode(mutable, "Node B")
  Graph.updateNode(mutable, 0, (data) => data.toUpperCase())
})

Graph.getNode(graph, 0) // => Option.some("NODE A")
```

## updateEdge

**Updating edge data**

```efx
import { Graph, Option } from "effect"

const result = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
  const nodeA = Graph.addNode(mutable, "Node A")
  const nodeB = Graph.addNode(mutable, "Node B")
  const edgeIndex = Graph.addEdge(mutable, nodeA, nodeB, 10)
  Graph.updateEdge(mutable, edgeIndex, (data) => data * 2)
})

Option.map(Graph.getEdge(result, 0), (edge) => edge.data) // => Option.some(20)
```

## mapNodes

**Mapping node data**

```efx
import { Graph, Option } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  Graph.addNode(mutable, "node a")
  Graph.addNode(mutable, "node b")
  Graph.addNode(mutable, "node c")
  Graph.mapNodes(mutable, (data) => data.toUpperCase())
})

Graph.getNode(graph, 0) // => Option.some("NODE A")
```

## mapEdges

**Mapping edge data**

```efx
import { Graph, Option } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, 10)
  Graph.addEdge(mutable, b, c, 20)
  Graph.mapEdges(mutable, (data) => data * 2)
})

Option.map(Graph.getEdge(graph, 0), (edge) => edge.data) // => Option.some(20)
```

## reverse

**Reversing edge directions**

```efx
import { Graph, Option } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, 1) // A -> B
  Graph.addEdge(mutable, b, c, 2) // B -> C
  Graph.reverse(mutable) // Now B -> A, C -> B
})

Option.map(Graph.getEdge(graph, 0), (edge) => edge.source) // => Option.some(1)
```

## filterMapNodes

**Filtering and mapping nodes**

```efx
import { Graph, Option } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "active")
  const b = Graph.addNode(mutable, "inactive")
  const c = Graph.addNode(mutable, "active")
  Graph.addEdge(mutable, a, b, 1)
  Graph.addEdge(mutable, b, c, 2)

  // Keep only "active" nodes and transform to uppercase
  Graph.filterMapNodes(
    mutable,
    (data) =>
      data === "active" ? Option.some(data.toUpperCase()) : Option.none()
  )
})

Graph.nodeCount(graph) // => 2
```

## filterMapEdges

**Filtering and mapping edges**

```efx
import { Graph, Option } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, 5)
  Graph.addEdge(mutable, b, c, 15)
  Graph.addEdge(mutable, c, a, 25)

  // Keep only edges with weight >= 10 and double their weight
  Graph.filterMapEdges(
    mutable,
    (data) => data >= 10 ? Option.some(data * 2) : Option.none()
  )
})

Graph.edgeCount(graph) // => 2
```

## filterNodes

**Filtering nodes**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  Graph.addNode(mutable, "active")
  Graph.addNode(mutable, "inactive")
  Graph.addNode(mutable, "pending")
  Graph.addNode(mutable, "active")

  // Keep only "active" nodes
  Graph.filterNodes(mutable, (data) => data === "active")
})

Graph.nodeCount(graph) // => 2
```

## filterEdges

**Filtering edges**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")

  Graph.addEdge(mutable, a, b, 5)
  Graph.addEdge(mutable, b, c, 15)
  Graph.addEdge(mutable, c, a, 25)

  // Keep only edges with weight >= 10
  Graph.filterEdges(mutable, (data) => data >= 10)
})

Graph.edgeCount(graph) // => 2
```

## addEdge

**Adding edges**

```efx
import { Graph } from "effect"

Graph.mutate(Graph.directed<string, number>(), (mutable) => {
  const nodeA = Graph.addNode(mutable, "Node A")
  const nodeB = Graph.addNode(mutable, "Node B")
  Graph.addEdge(mutable, nodeA, nodeB, 42) // => 0
})
```

## removeNode

**Removing a node**

```efx
import { Graph } from "effect"

const result = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
  const nodeA = Graph.addNode(mutable, "Node A")
  const nodeB = Graph.addNode(mutable, "Node B")
  Graph.addEdge(mutable, nodeA, nodeB, 42)

  // Remove nodeA and all edges connected to it
  Graph.removeNode(mutable, nodeA)
})
Array.of(Graph.nodeCount(result), Graph.edgeCount(result)) // => [1, 0]
```

## removeEdge

**Removing an edge**

```efx
import { Graph } from "effect"

const result = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
  const nodeA = Graph.addNode(mutable, "Node A")
  const nodeB = Graph.addNode(mutable, "Node B")
  const edge = Graph.addEdge(mutable, nodeA, nodeB, 42)

  // Remove the edge
  Graph.removeEdge(mutable, edge)
})
Array.of(Graph.nodeCount(result), Graph.edgeCount(result)) // => [2, 0]
```

## getEdge

**Getting edge data**

```efx
import { Graph, Option } from "effect"

const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
  const nodeA = Graph.addNode(mutable, "Node A")
  const nodeB = Graph.addNode(mutable, "Node B")
  Graph.addEdge(mutable, nodeA, nodeB, 42)
})

Graph.getEdge(graph, 0) // => Option.some({ source: 0, target: 1, data: 42 })
```

## hasEdge

**Checking edge existence**

```efx
import { Graph } from "effect"

const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
  const nodeA = Graph.addNode(mutable, "Node A")
  const nodeB = Graph.addNode(mutable, "Node B")
  const nodeC = Graph.addNode(mutable, "Node C")
  Graph.addEdge(mutable, nodeA, nodeB, 42)
})

Graph.hasEdge(graph, 0, 1) // => true
Graph.hasEdge(graph, 0, 2) // => false
```

## edgeCount

**Counting edges**

```efx
import { Graph } from "effect"

const emptyGraph = Graph.directed<string, number>()
Graph.edgeCount(emptyGraph) // => 0

const graphWithEdges = Graph.mutate(emptyGraph, (mutable) => {
  const nodeA = Graph.addNode(mutable, "Node A")
  const nodeB = Graph.addNode(mutable, "Node B")
  const nodeC = Graph.addNode(mutable, "Node C")
  Graph.addEdge(mutable, nodeA, nodeB, 1)
  Graph.addEdge(mutable, nodeB, nodeC, 2)
  Graph.addEdge(mutable, nodeC, nodeA, 3)
})

Graph.edgeCount(graphWithEdges) // => 3
```

## neighbors

**Getting outgoing neighbors**

```efx
import { Graph } from "effect"

const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
  const nodeA = Graph.addNode(mutable, "Node A")
  const nodeB = Graph.addNode(mutable, "Node B")
  const nodeC = Graph.addNode(mutable, "Node C")
  Graph.addEdge(mutable, nodeA, nodeB, 1)
  Graph.addEdge(mutable, nodeA, nodeC, 2)
})

Graph.neighbors(graph, 0) // => [1, 2]
Graph.neighbors(graph, 1) // => []
```

## neighborsDirected

**Traversing directed neighbors**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, string>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  Graph.addEdge(mutable, a, b, "A->B")
})

const nodeA = 0
const nodeB = 1

// Get outgoing neighbors (nodes that nodeA points to)
const outgoing = Graph.neighborsDirected(graph, nodeA, "outgoing")

// Get incoming neighbors (nodes that point to nodeB)
const incoming = Graph.neighborsDirected(graph, nodeB, "incoming")
Array.of(outgoing, incoming) // => [[1], [0]]
```

## GraphVizOptions

**Configuring GraphViz labels**

```efx
import type { Graph } from "effect"

// Basic options with custom labels
const basicOptions: Graph.GraphVizOptions<string, number> = {
  nodeLabel: (data) => `Node: ${data}`,
  edgeLabel: (data) => `Weight: ${data}`
}

// Complete options with graph naming
const namedOptions: Graph.GraphVizOptions<string, string> = {
  nodeLabel: (data) => data.toUpperCase(),
  edgeLabel: (data) => data,
  graphName: "MyDependencyGraph"
}
Array.of(basicOptions.nodeLabel?.("A"), namedOptions.graphName) // => ["Node: A", "MyDependencyGraph"]
```

## toGraphViz

**Exporting GraphViz DOT**

```efx
import { Graph } from "effect"

const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
  const nodeA = Graph.addNode(mutable, "Node A")
  const nodeB = Graph.addNode(mutable, "Node B")
  const nodeC = Graph.addNode(mutable, "Node C")
  Graph.addEdge(mutable, nodeA, nodeB, 1)
  Graph.addEdge(mutable, nodeB, nodeC, 2)
  Graph.addEdge(mutable, nodeC, nodeA, 3)
})

Graph.toGraphViz(graph).split("\n") // => ['digraph "G" {', '  "0" [label="Node A"];', '  "1" [label="Node B"];', '  "2" [label="Node C"];', '  "0" -> "1" [label="1"];', '  "1" -> "2" [label="2"];', '  "2" -> "0" [label="3"];', "}"]
```

## MermaidNodeShape

**Selecting Mermaid node shapes**

```efx
import type { Graph } from "effect"

// Shape selector function for different node types
const shapeSelector = (nodeData: string): Graph.MermaidNodeShape => {
  if (nodeData.includes("start") || nodeData.includes("end")) return "circle"
  if (nodeData.includes("decision")) return "diamond"
  if (nodeData.includes("process")) return "rectangle"
  if (nodeData.includes("data")) return "cylindrical"
  return "rounded"
}

const options: Graph.MermaidOptions<string, string> = {
  nodeShape: shapeSelector
}
options.nodeShape?.("decision") // => "diamond"
```

## MermaidDirection

**Configuring Mermaid directions**

```efx
import type { Graph } from "effect"

// Horizontal workflow diagram
const horizontalOptions: Graph.MermaidOptions<string, string> = {
  direction: "LR"
}

// Vertical hierarchy (default)
const verticalOptions: Graph.MermaidOptions<string, string> = {
  direction: "TB"
}

// Bottom-up flow
const bottomUpOptions: Graph.MermaidOptions<string, string> = {
  direction: "BT"
}
Array.of(horizontalOptions.direction, verticalOptions.direction, bottomUpOptions.direction) // => ["LR", "TB", "BT"]
```

## MermaidDiagramType

**Selecting Mermaid diagram types**

```efx
import type { Graph } from "effect"

// Force flowchart format (even for undirected graphs)
const flowchartOptions: Graph.MermaidOptions<string, string> = {
  diagramType: "flowchart"
}

// Force graph format (shows undirected connections)
const graphOptions: Graph.MermaidOptions<string, string> = {
  diagramType: "graph"
}

// Auto-detection (recommended, default behavior)
const autoOptions: Graph.MermaidOptions<string, string> = {}
Array.of(flowchartOptions.diagramType, graphOptions.diagramType, autoOptions.diagramType) // => ["flowchart", "graph", undefined]
```

## MermaidOptions

**Configuring Mermaid output**

```efx
import type { Graph } from "effect"

// Basic options with custom labels
const basicOptions: Graph.MermaidOptions<string, number> = {
  nodeLabel: (data) => `Node: ${data}`,
  edgeLabel: (data) => `Weight: ${data}`
}

// Advanced options with all features
const advancedOptions: Graph.MermaidOptions<string, string> = {
  nodeLabel: (data) => data.toUpperCase(),
  edgeLabel: (data) => data,
  diagramType: "flowchart",
  direction: "LR",
  nodeShape: (data) => data.includes("start") ? "circle" : "rectangle"
}
Array.of(basicOptions.nodeLabel?.("A"), advancedOptions.nodeShape?.("start")) // => ["Node: A", "circle"]
```

## toMermaid

**Exporting a Mermaid diagram**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, string>((mutable) => {
  const app = Graph.addNode(mutable, "App")
  const database = Graph.addNode(mutable, "Database")
  Graph.addEdge(mutable, app, database, "queries")
})

Graph.toMermaid(graph).split("\n") // => ["flowchart TD", '  0["App"]', '  1["Database"]', '  0 -->|"queries"| 1']
```

## TraversalDirection

**Traversing by direction**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, string>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, "A-B")
  Graph.addEdge(mutable, a, c, "A-C")
})

Array.from(Graph.indices(Graph.bfs(graph, { start: [0], direction: "outgoing" }))) // => [0, 1, 2]
Array.from(Graph.indices(Graph.bfs(graph, { start: [1], direction: "incoming" }))) // => [1, 0]
Array.from(Graph.indices(Graph.bfs(graph, { start: [1], direction: "undirected" }))) // => [1, 0, 2]
```

## isAcyclic

**Checking cycles**

```efx
import { Graph } from "effect"

// Acyclic directed graph (DAG)
const dag = Graph.directed<string, string>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, "A->B")
  Graph.addEdge(mutable, b, c, "B->C")
})
Graph.isAcyclic(dag) // => true

// Cyclic directed graph
const cyclic = Graph.directed<string, string>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  Graph.addEdge(mutable, a, b, "A->B")
  Graph.addEdge(mutable, b, a, "B->A") // Creates cycle
})
Graph.isAcyclic(cyclic) // => false
```

## isBipartite

**Checking bipartite graphs**

```efx
import { Graph } from "effect"

// Bipartite graph (alternating coloring possible)
const bipartite = Graph.undirected<string, string>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  const d = Graph.addNode(mutable, "D")
  Graph.addEdge(mutable, a, b, "edge") // Set 1: {A, C}, Set 2: {B, D}
  Graph.addEdge(mutable, b, c, "edge")
  Graph.addEdge(mutable, c, d, "edge")
})
Graph.isBipartite(bipartite) // => true

// Non-bipartite graph (odd cycle)
const triangle = Graph.undirected<string, string>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, "edge")
  Graph.addEdge(mutable, b, c, "edge")
  Graph.addEdge(mutable, c, a, "edge") // Triangle (3-cycle)
})
Graph.isBipartite(triangle) // => false
```

## maximumBipartiteMatching

**Matching a bipartite graph**

```efx
import { Graph } from "effect"

const graph = Graph.undirected<string, string>((mutable) => {
  for (const node of ["A", "B", "X", "Y"]) Graph.addNode(mutable, node)
  Graph.addEdge(mutable, 0, 2, "A-X")
  Graph.addEdge(mutable, 0, 3, "A-Y")
  Graph.addEdge(mutable, 1, 2, "B-X")
})

Graph.maximumBipartiteMatching(graph) // => [{ left: 0, right: 3, edge: 1 }, { left: 1, right: 2, edge: 2 }]
```

## connectedComponents

**Finding connected components**

```efx
import { Graph } from "effect"

const graph = Graph.undirected<string, string>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  const d = Graph.addNode(mutable, "D")
  Graph.addEdge(mutable, a, b, "edge") // Component 1: A-B
  Graph.addEdge(mutable, c, d, "edge") // Component 2: C-D
})

Graph.connectedComponents(graph) // => [[0, 1], [2, 3]]
```

## bridges

**Finding bridge edges**

```efx
import { Graph } from "effect"

const graph = Graph.undirected<void, void>((mutable) => {
  for (let i = 0; i < 3; i++) Graph.addNode(mutable, undefined)
  Graph.addEdge(mutable, 0, 1, undefined)
  Graph.addEdge(mutable, 1, 2, undefined)
})

Graph.bridges(graph) // => [0, 1]
```

## articulationPoints

**Finding articulation points**

```efx
import { Graph } from "effect"

const graph = Graph.undirected<void, void>((mutable) => {
  for (let i = 0; i < 3; i++) Graph.addNode(mutable, undefined)
  Graph.addEdge(mutable, 0, 1, undefined)
  Graph.addEdge(mutable, 1, 2, undefined)
})

Graph.articulationPoints(graph) // => [1]
```

## biconnectedComponents

**Finding biconnected components**

```efx
import { Graph } from "effect"

const graph = Graph.undirected<void, void>((mutable) => {
  for (let i = 0; i < 5; i++) Graph.addNode(mutable, undefined)
  Graph.addEdge(mutable, 0, 1, undefined)
  Graph.addEdge(mutable, 1, 2, undefined)
  Graph.addEdge(mutable, 2, 0, undefined)
  Graph.addEdge(mutable, 2, 3, undefined)
  Graph.addEdge(mutable, 3, 4, undefined)
  Graph.addEdge(mutable, 4, 2, undefined)
})

Graph.biconnectedComponents(graph) // => [[0, 1, 2], [2, 3, 4]]
```

## maximumFlow

**Computing maximum flow**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  for (const node of ["source", "a", "target"]) Graph.addNode(mutable, node)
  Graph.addEdge(mutable, 0, 1, 3)
  Graph.addEdge(mutable, 1, 2, 2)
  Graph.addEdge(mutable, 0, 2, 1)
})

Graph.maximumFlow(graph, { source: 0, target: 2, capacity: (edge) => edge }).value // => 3
```

## minimumCut

**Partitioning a minimum cut**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  for (const node of ["source", "a", "target"]) Graph.addNode(mutable, node)
  Graph.addEdge(mutable, 0, 1, 2)
  Graph.addEdge(mutable, 1, 2, 1)
})

Graph.minimumCut(graph, { source: 0, target: 2, capacity: (edge) => edge }).source // => [0, 1]
```

## stronglyConnectedComponents

**Finding strongly connected components**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, string>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, "A->B")
  Graph.addEdge(mutable, b, c, "B->C")
  Graph.addEdge(mutable, c, a, "C->A") // Creates SCC: A-B-C
})

Graph.stronglyConnectedComponents(graph) // => [[0, 2, 1]]
```

## dijkstra

**Finding shortest paths with Dijkstra**

```efx
import { Graph, Option } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, 5)
  Graph.addEdge(mutable, a, c, 10)
  Graph.addEdge(mutable, b, c, 2)
})

const result = Graph.dijkstra(graph, {
  source: 0,
  target: 2,
  cost: (edgeData) => edgeData
})

Option.map(result, ({ distance, path }) => [distance, path] as const) // => Option.some([7, [0, 1, 2]])
```

## floydWarshall

**Finding all-pairs shortest paths**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, 3)
  Graph.addEdge(mutable, b, c, 2)
  Graph.addEdge(mutable, a, c, 7)
})

const result = Graph.floydWarshall(graph, (edgeData) => edgeData)
const shortest = { distance: result.distances.get(0)?.get(2), path: result.paths.get(0)?.get(2) }
shortest // => { distance: 5, path: [0, 1, 2] }
```

## astar

**Finding shortest paths with A***

```efx
import { Graph, Option } from "effect"

const graph = Graph.directed<{ x: number; y: number }, number>((mutable) => {
  const a = Graph.addNode(mutable, { x: 0, y: 0 })
  const b = Graph.addNode(mutable, { x: 1, y: 0 })
  const c = Graph.addNode(mutable, { x: 2, y: 0 })
  Graph.addEdge(mutable, a, b, 1)
  Graph.addEdge(mutable, b, c, 1)
})

// Manhattan distance heuristic
const heuristic = (
  nodeData: { x: number; y: number },
  targetData: { x: number; y: number }
) => Math.abs(nodeData.x - targetData.x) + Math.abs(nodeData.y - targetData.y)

const result = Graph.astar(graph, {
  source: 0,
  target: 2,
  cost: (edgeData) => edgeData,
  heuristic
})

Option.map(result, ({ distance, path }) => [distance, path] as const) // => Option.some([2, [0, 1, 2]])
```

## bellmanFord

**Finding shortest paths with Bellman-Ford**

```efx
import { Graph, Option } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, -1) // Negative weight allowed
  Graph.addEdge(mutable, b, c, 3)
  Graph.addEdge(mutable, a, c, 5)
})

const result = Graph.bellmanFord(graph, {
  source: 0,
  target: 2,
  cost: (edgeData) => edgeData
})

Option.map(result, ({ distance, path }) => [distance, path] as const) // => Option.some([2, [0, 1, 2]])
```

## Walker

**Working with node walkers**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  Graph.addEdge(mutable, a, b, 1)
})

// Both traversal and element iterators return NodeWalker
const dfsNodes: Graph.NodeWalker<string> = Graph.dfs(graph, { start: [0] })
const allNodes: Graph.NodeWalker<string> = Graph.nodes(graph)

// Common interface for working with node iterables
function processNodes<N>(nodeIterable: Graph.NodeWalker<N>): Array<number> {
  return Array.from(Graph.indices(nodeIterable))
}

// Access node data using values() or entries()
Array.from(Graph.values(dfsNodes)) // => ["A", "B"]
Array.from(Graph.entries(allNodes)) // => [[0, "A"], [1, "B"]]
```

## Walker.visit

**Visiting walker elements**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  Graph.addEdge(mutable, a, b, 1)
})

const dfs = Graph.dfs(graph, { start: [0] })

// Map to just the node data
Array.from(dfs.visit((index, data) => data)) // => ["A", "B"]

// Map to custom objects
Array.from(dfs.visit((index, data) => ({ id: index, name: data }))) // => [{ id: 0, name: "A" }, { id: 1, name: "B" }]
```

## indices

**Iterating walker indices**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  Graph.addEdge(mutable, a, b, 1)
})

const dfs = Graph.dfs(graph, { start: [0] })
Array.from(Graph.indices(dfs)) // => [0, 1]
```

## values

**Iterating walker values**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  Graph.addEdge(mutable, a, b, 1)
})

const dfs = Graph.dfs(graph, { start: [0] })
Array.from(Graph.values(dfs)) // => ["A", "B"]
```

## entries

**Iterating walker entries**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  Graph.addEdge(mutable, a, b, 1)
})

const dfs = Graph.dfs(graph, { start: [0] })
Array.from(Graph.entries(dfs)) // => [[0, "A"], [1, "B"]]
```

## dfs

**Traversing depth-first**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, 1)
  Graph.addEdge(mutable, b, c, 1)
})

// Start from a specific node
Array.from(Graph.indices(Graph.dfs(graph, { start: [0] }))) // => [0, 1, 2]

Array.from(Graph.indices(Graph.dfs(graph))) // => []
```

## bfs

**Traversing breadth-first**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, 1)
  Graph.addEdge(mutable, b, c, 1)
})

// Start from a specific node
Array.from(Graph.indices(Graph.bfs(graph, { start: [0] }))) // => [0, 1, 2]

Array.from(Graph.indices(Graph.bfs(graph))) // => []
```

## topo

**Sorting topologically**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, 1)
  Graph.addEdge(mutable, b, c, 1)
})

Array.from(Graph.indices(Graph.topo(graph))) // => [0, 1, 2]
```

## dfsPostOrder

**Traversing in postorder**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const root = Graph.addNode(mutable, "root")
  const child1 = Graph.addNode(mutable, "child1")
  const child2 = Graph.addNode(mutable, "child2")
  Graph.addEdge(mutable, root, child1, 1)
  Graph.addEdge(mutable, root, child2, 1)
})

// Postorder: children before parents
Array.from(Graph.indices(Graph.dfsPostOrder(graph, { start: [0] }))) // => [1, 2, 0]
```

## nodes

**Iterating all nodes**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, 1)
})

Array.from(Graph.indices(Graph.nodes(graph))) // => [0, 1, 2]
```

## edges

**Iterating all edges**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "A")
  const b = Graph.addNode(mutable, "B")
  const c = Graph.addNode(mutable, "C")
  Graph.addEdge(mutable, a, b, 1)
  Graph.addEdge(mutable, b, c, 2)
})

Array.from(Graph.indices(Graph.edges(graph))) // => [0, 1]
```

## externals

**Iterating external nodes**

```efx
import { Graph } from "effect"

const graph = Graph.directed<string, number>((mutable) => {
  const source = Graph.addNode(mutable, "source") // 0 - no incoming
  const middle = Graph.addNode(mutable, "middle") // 1 - has both
  const sink = Graph.addNode(mutable, "sink") // 2 - no outgoing
  const isolated = Graph.addNode(mutable, "isolated") // 3 - no edges

  Graph.addEdge(mutable, source, middle, 1)
  Graph.addEdge(mutable, middle, sink, 2)
})

// Nodes with no outgoing edges (sinks + isolated)
Array.from(Graph.indices(Graph.externals(graph, { direction: "outgoing" }))) // => [2, 3]

// Nodes with no incoming edges (sources + isolated)
Array.from(Graph.indices(Graph.externals(graph, { direction: "incoming" }))) // => [0, 3]
```
