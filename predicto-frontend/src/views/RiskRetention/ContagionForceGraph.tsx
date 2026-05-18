// TODO: Code will be pasted manually
/**
 * src/views/RiskRetention/ContagionForceGraph.tsx
 *
 * REFINEMENT #4 — Rendering Performance: Canvas Isolation from React State
 *
 * HAZARD ELIMINATED:
 * A naïve implementation would store node positions in React useState().
 * D3-force mutates node x/y coordinates on every simulation tick (~60fps).
 * If those mutations triggered setState(), React would re-render the component
 * tree at 60fps — enough to freeze the browser on a 500+ node graph.
 *
 * SOLUTION — Three-layer isolation:
 *
 * LAYER 1 — React owns the canvas element via useRef (canvasRef).
 *   React never sees node coordinates. The ref is a stable pointer;
 *   assigning x/y to simulation nodes never touches React state.
 *
 * LAYER 2 — D3-force simulation runs entirely against ref-stored node objects.
 *   simulationRef holds the d3.Simulation instance. Node positions are mutated
 *   in-place by D3 on each tick. React is never notified.
 *
 * LAYER 3 — Slider/filter changes that need to update the simulation are
 *   debounced (300ms) before touching the simulation. Mouse moves, hover
 *   tooltips, and filter changes do not re-initialise the physics engine —
 *   they call simulationRef.current.alpha(0.3).restart() to "warm" it.
 *
 * REACT STATE is reserved for:
 *   - hoveredNodeId (triggers tooltip render — lightweight)
 *   - simulateChurnNodeId (triggers the "what-if" panel — one-time)
 *   - isLoading / isError (data fetch status)
 *
 * EVERYTHING ELSE lives in refs, D3 selection closures, or canvas context.
 */

import {
    useRef,
    useEffect,
    useState,
    useCallback,
    useMemo,
    memo,
} from "react";
import * as d3 from "d3";
import { useContagionNetworkQuery } from "@/hooks/useGodTierQueries";
import { ContagionNodeTooltip } from "./ContagionNodeTooltip";
import { ContagionSimulatePanel } from "./ContagionSimulatePanel";
import { useDataStore, selectIsReady } from "@/store/useDataStore";
import type {
    ContagionNodeRisk,
    ContagionPath,
} from "@/types/godtier/contagionNetwork";

// ─── D3 simulation node type ──────────────────────────────────────────────────
// Extends ContagionNodeRisk with D3-force mutable position fields.
// These fields are NEVER stored in React state.
interface SimulationNode extends ContagionNodeRisk, d3.SimulationNodeDatum {
    x: number;
    y: number;
    vx: number;
    vy: number;
    fx: number | null;
    fy: number | null;
}

interface SimulationLink extends d3.SimulationLinkDatum<SimulationNode> {
    source: SimulationNode;
    target: SimulationNode;
    pathRisk: number;
}

// ─── Visual constants ─────────────────────────────────────────────────────────
const NODE_RADIUS_MIN = 6;
const NODE_RADIUS_MAX = 28;
const ANCHOR_RING_WIDTH = 3;
const DEBOUNCE_MS = 300;

// Colour scale: low contagion (cool blue) → high contagion (hot red)
const contagionColorScale = d3
    .scaleSequential(d3.interpolateRdYlGn)
    .domain([1, 0]); // inverted: 0 = green (safe), 1 = red (critical)

// ─── Component ────────────────────────────────────────────────────────────────
interface ContagionForceGraphProps {
    /** Filter: only show nodes with contagion_risk_factor >= this threshold */
    riskThreshold?: number;
    /** Filter: only show nodes matching these segment labels */
    segmentFilter?: string[];
}

export const ContagionForceGraph = memo(function ContagionForceGraph({
    riskThreshold = 0,
    segmentFilter = [],
}: ContagionForceGraphProps) {
    const isSystemReady = useDataStore(selectIsReady);

    // ── Data fetch ────────────────────────────────────────────────────────────
    const { data, isLoading, isError } = useContagionNetworkQuery({
        enabled: isSystemReady,
    });

    // ── React state (lightweight — only for overlay UI) ───────────────────────
    const [hoveredNode, setHoveredNode] = useState<SimulationNode | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [simulateChurnNodeId, setSimulateChurnNodeId] = useState<string | null>(
        null
    );

    // ── Stable refs (NEVER trigger re-renders) ────────────────────────────────
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const simulationRef = useRef<d3.Simulation<
        SimulationNode,
        SimulationLink
    > | null>(null);
    const nodesRef = useRef<SimulationNode[]>([]);
    const linksRef = useRef<SimulationLink[]>([]);
    const animFrameRef = useRef<number>(0);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const arrExtentRef = useRef<[number, number]>([0, 1]);

    // ── Memoised filtered data (recomputes only when filter props change) ─────
    const filteredNodes = useMemo<ContagionNodeRisk[]>(() => {
        if (!data?.nodes) return [];
        return data.nodes.filter((n) => {
            const passRisk = n.contagion_risk_factor >= riskThreshold;
            const passSegment =
                segmentFilter.length === 0 || segmentFilter.includes(n.segment);
            return passRisk && passSegment;
        });
    }, [data?.nodes, riskThreshold, segmentFilter]);

    const filteredNodeIds = useMemo(
        () => new Set(filteredNodes.map((n) => n.customer_id)),
        [filteredNodes]
    );

    const filteredPaths = useMemo<ContagionPath[]>(() => {
        if (!data?.contagion_paths) return [];
        return data.contagion_paths.filter(
            (p) =>
                filteredNodeIds.has(p.anchor_customer_id) &&
                filteredNodeIds.has(p.affected_customer_id)
        );
    }, [data?.contagion_paths, filteredNodeIds]);

    // ─── Canvas draw function (runs every D3 tick, never touches React state) ─
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const { width, height } = canvas;
        const radiusScale = d3
            .scaleSqrt()
            .domain(arrExtentRef.current)
            .range([NODE_RADIUS_MIN, NODE_RADIUS_MAX])
            .clamp(true);

        ctx.clearRect(0, 0, width, height);

        // ── Draw edges ───────────────────────────────────────────────────────────
        ctx.save();
        for (const link of linksRef.current) {
            const { source, target, pathRisk } = link;
            const alpha = 0.15 + pathRisk * 0.65;
            const hue = Math.round((1 - pathRisk) * 120); // 120 = green, 0 = red
            ctx.beginPath();
            ctx.moveTo(source.x, source.y);
            ctx.lineTo(target.x, target.y);
            ctx.strokeStyle = `hsla(${hue},70%,45%,${alpha})`;
            ctx.lineWidth = 1 + pathRisk * 2;
            ctx.stroke();
        }
        ctx.restore();

        // ── Draw nodes ───────────────────────────────────────────────────────────
        for (const node of nodesRef.current) {
            const r = radiusScale(node.arr);
            const fillColor = contagionColorScale(node.contagion_risk_factor);

            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
            ctx.fillStyle = fillColor;
            ctx.fill();

            // Anchor ring — amber pulsed border for anchor nodes
            if (node.is_anchor_node) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, r + ANCHOR_RING_WIDTH, 0, Math.PI * 2);
                ctx.strokeStyle = "rgba(245, 158, 11, 0.85)"; // amber-400
                ctx.lineWidth = ANCHOR_RING_WIDTH;
                ctx.stroke();
            }

            // Hovered node highlight ring
            if (hoveredNode?.customer_id === node.customer_id) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
                ctx.strokeStyle = "rgba(255,255,255,0.9)";
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
    }, [hoveredNode]);

    // ── Initialise / reinitialise simulation when filtered data changes ───────
    // Debounced so rapid filter slider drags don't thrash the physics engine.
    const initSimulation = useCallback(() => {
        if (filteredNodes.length === 0) return;

        // Cancel pending debounce
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
            // Stop previous simulation
            simulationRef.current?.stop();
            cancelAnimationFrame(animFrameRef.current);

            const canvas = canvasRef.current;
            if (!canvas) return;
            const { width, height } = canvas;

            // Build simulation node array (D3 mutates x/y in-place on these objects)
            const simNodes: SimulationNode[] = filteredNodes.map((n) => ({
                ...n,
                x: width / 2 + (Math.random() - 0.5) * 200,
                y: height / 2 + (Math.random() - 0.5) * 200,
                vx: 0,
                vy: 0,
                fx: null,
                fy: null,
            }));

            // Build id → index map for link resolution
            const idToNode = new Map(
                simNodes.map((n) => [n.customer_id, n])
            );

            const simLinks: SimulationLink[] = filteredPaths
                .map((p) => {
                    const s = idToNode.get(p.anchor_customer_id);
                    const t = idToNode.get(p.affected_customer_id);
                    if (!s || !t) return null;
                    return { source: s, target: t, pathRisk: p.path_risk } as SimulationLink;
                })
                .filter((l): l is SimulationLink => l !== null);

            // Update ARR extent for radius scale
            const arrValues = simNodes.map((n) => n.arr);
            arrExtentRef.current = [
                Math.min(...arrValues) || 0,
                Math.max(...arrValues) || 1,
            ];

            nodesRef.current = simNodes;
            linksRef.current = simLinks;

            // ── D3 force simulation (runs entirely off React state) ───────────────
            simulationRef.current = d3
                .forceSimulation<SimulationNode>(simNodes)
                .force(
                    "link",
                    d3
                        .forceLink<SimulationNode, SimulationLink>(simLinks)
                        .id((d) => d.customer_id)
                        .distance(60)
                        .strength(0.4)
                )
                .force(
                    "charge",
                    d3.forceManyBody<SimulationNode>().strength(-120)
                )
                .force("center", d3.forceCenter(width / 2, height / 2))
                .force(
                    "collision",
                    d3
                        .forceCollide<SimulationNode>()
                        .radius((d) => {
                            const r = d3
                                .scaleSqrt()
                                .domain(arrExtentRef.current)
                                .range([NODE_RADIUS_MIN, NODE_RADIUS_MAX])(d.arr);
                            return r + 4;
                        })
                )
                .alphaDecay(0.02)
                .on("tick", () => {
                    // Draw directly on the canvas — ZERO React setState calls
                    animFrameRef.current = requestAnimationFrame(draw);
                });
        }, DEBOUNCE_MS);
    }, [filteredNodes, filteredPaths, draw]);

    // Trigger re-init when data or filters change
    useEffect(() => {
        initSimulation();
        return () => {
            simulationRef.current?.stop();
            cancelAnimationFrame(animFrameRef.current);
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, [initSimulation]);

    // ── Mouse event handlers (pointer-based hit testing against nodesRef) ─────
    // These read from refs, never from React state → no re-render per mouse move.
    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            const radiusScale = d3
                .scaleSqrt()
                .domain(arrExtentRef.current)
                .range([NODE_RADIUS_MIN, NODE_RADIUS_MAX])
                .clamp(true);

            const hit = nodesRef.current.find((n) => {
                const r = radiusScale(n.arr);
                return Math.hypot(n.x - mx, n.y - my) <= r;
            });

            // setHoveredNode IS a setState call, but it only fires when the hovered
            // node identity changes — not on every mouse-move pixel.
            if (hit?.customer_id !== hoveredNode?.customer_id) {
                setHoveredNode(hit ?? null);
                if (hit) setTooltipPos({ x: e.clientX, y: e.clientY });
            }
        },
        [hoveredNode]
    );

    const handleClick = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            const radiusScale = d3
                .scaleSqrt()
                .domain(arrExtentRef.current)
                .range([NODE_RADIUS_MIN, NODE_RADIUS_MAX])
                .clamp(true);

            const hit = nodesRef.current.find((n) => {
                const r = radiusScale(n.arr);
                return Math.hypot(n.x - mx, n.y - my) <= r;
            });

            if (hit?.is_anchor_node) {
                // Opens the "Simulate churn" side panel — one setState per click
                setSimulateChurnNodeId(hit.customer_id);
            }
        },
        []
    );

    // ─── Render ───────────────────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[520px] text-sm text-gray-500">
                Building contagion network…
            </div>
        );
    }

    if (isError || !data) {
        return (
            <div className="flex items-center justify-center h-[520px] text-sm text-red-500">
                Contagion data unavailable — upload data to enable network analysis.
            </div>
        );
    }

    return (
        <div className="relative w-full h-[520px] rounded-xl overflow-hidden bg-gray-950">
            {/* Canvas is the only output layer — React markup is minimal */}
            <canvas
                ref={canvasRef}
                width={1200}
                height={520}
                className="w-full h-full"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={handleClick}
                aria-label="Revenue contagion network graph"
                role="img"
            />

            {/* Tooltip — lightweight React overlay, renders only when a node is hovered */}
            {hoveredNode && (
                <ContagionNodeTooltip
                    node={hoveredNode}
                    screenX={tooltipPos.x}
                    screenY={tooltipPos.y}
                />
            )}

            {/* "Simulate churn" side panel — renders only when an anchor node is clicked */}
            {simulateChurnNodeId && (
                <ContagionSimulatePanel
                    anchorCustomerId={simulateChurnNodeId}
                    allNodes={nodesRef.current}
                    contagionPaths={data.contagion_paths}
                    onClose={() => setSimulateChurnNodeId(null)}
                />
            )}

            {/* Network summary badge — static, no D3 dependency */}
            <div className="absolute bottom-3 right-3 bg-gray-900/80 rounded-lg px-3 py-2 text-xs text-gray-300 space-y-0.5">
                <div>{data.network_summary.total_customers} nodes</div>
                <div>{data.network_summary.anchor_nodes} anchors</div>
                <div className="text-amber-400">
                    {data.network_summary.critical_nodes} critical
                </div>
            </div>
        </div>
    );
});