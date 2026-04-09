export type ToolConfig = {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly latencyRange: readonly [min: number, max: number]
  readonly sampleArgs: Record<string, unknown>
  readonly sampleResult: unknown
}

// -- Support Agent tools --

export const SUPPORT_AGENT_TOOLS: readonly ToolConfig[] = [
  {
    name: "lookup_order",
    description: "Look up order by ID or customer email",
    parameters: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Order ID (e.g. ACM-78432)" },
        email: { type: "string", description: "Customer email" },
      },
    },
    latencyRange: [50, 300],
    sampleArgs: { order_id: "ACM-78432" },
    sampleResult: {
      order_id: "ACM-78432",
      status: "in_transit",
      items: [{ product: "Giant Magnet (Industrial)", sku: "GMG-006", qty: 1 }],
      shipping: { carrier: "Acme Ground", eta: "2026-04-09" },
    },
  },
  {
    name: "check_warranty",
    description: "Check warranty coverage, returns coverage status and exclusion list",
    parameters: {
      type: "object",
      properties: {
        product_sku: { type: "string" },
        order_id: { type: "string" },
      },
      required: ["product_sku"],
    },
    latencyRange: [80, 400],
    sampleArgs: { product_sku: "RSK-001", order_id: "ACM-55112" },
    sampleResult: {
      covered: true,
      exclusions: [
        "incidents involving cliffs, mesas, canyons, or elevated terrain",
        "misuse contrary to product manual",
        "use in proximity to roadrunners",
      ],
      expires: "2027-01-15",
    },
  },
  {
    name: "process_return",
    description: "Initiate a return or exchange",
    parameters: {
      type: "object",
      properties: {
        order_id: { type: "string" },
        reason: { type: "string" },
        exchange: { type: "boolean" },
      },
      required: ["order_id", "reason"],
    },
    latencyRange: [100, 500],
    sampleArgs: { order_id: "ACM-55112", reason: "Product malfunction", exchange: true },
    sampleResult: {
      return_id: "RET-20260405-001",
      status: "initiated",
      label_url: "https://acme.com/return/RET-20260405-001",
    },
  },
  {
    name: "check_inventory",
    description: "Check product stock at a warehouse",
    parameters: {
      type: "object",
      properties: {
        product_sku: { type: "string" },
        warehouse: { type: "string", description: "desert | mountain | urban" },
      },
      required: ["product_sku"],
    },
    latencyRange: [50, 200],
    sampleArgs: { product_sku: "RSK-001", warehouse: "desert" },
    sampleResult: { available: 42, warehouse: "Desert Division", reserved: 3 },
  },
  {
    name: "calculate_shipping",
    description: "Calculate cost and ETA (cliff-edge delivery surcharge applies)",
    parameters: {
      type: "object",
      properties: {
        product_sku: { type: "string" },
        destination: { type: "string" },
        express: { type: "boolean" },
      },
      required: ["product_sku", "destination"],
    },
    latencyRange: [30, 150],
    sampleArgs: { product_sku: "ANV-003", destination: "Mesa Top, AZ" },
    sampleResult: { cost: 89.99, eta_days: 5, surcharges: [{ type: "cliff-edge", amount: 29.99 }] },
  },
  {
    name: "create_support_ticket",
    description: "Escalate to human support",
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
        description: { type: "string" },
      },
      required: ["subject", "priority"],
    },
    latencyRange: [100, 400],
    sampleArgs: {
      subject: "Warranty dispute — cliff incident",
      priority: "high",
      description: "Customer disputes Section 14.2 exclusion",
    },
    sampleResult: { ticket_id: "ESC-2026-446", status: "created", assigned_to: "support-team-lead" },
  },
  {
    name: "search_product_catalog",
    description: "RAG search over product specs and safety data sheets",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, category: { type: "string" } },
      required: ["query"],
    },
    latencyRange: [80, 500],
    sampleArgs: { query: "trap products for fast targets" },
    sampleResult: {
      results: [
        { sku: "SGT-015", name: "Super Glue Trap (XL)", relevance: 0.94 },
        { sku: "BSE-014", name: "Bird Seed (Premium Blend)", relevance: 0.87 },
      ],
    },
  },
  {
    name: "search_faq",
    description: "RAG search over the Acme knowledge base",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    latencyRange: [60, 300],
    sampleArgs: { query: "cliff-edge delivery policy" },
    sampleResult: {
      results: [
        {
          title: "Cliff-Edge Delivery Surcharge Policy",
          excerpt: "A surcharge of $29.99 applies to deliveries within 50m of a cliff edge...",
        },
      ],
    },
  },
]

// -- Order Router tools --

export const ORDER_ROUTER_TOOLS: readonly ToolConfig[] = [
  {
    name: "validate_address",
    description: "Validates delivery address. Returns warnings like 'cliff edge detected'.",
    parameters: {
      type: "object",
      properties: { address: { type: "string" }, coordinates: { type: "string" } },
      required: ["address"],
    },
    latencyRange: [40, 200],
    sampleArgs: { address: "14 Mesa Drive, Flagstaff, AZ 86001" },
    sampleResult: { valid: true, warnings: [], normalized: "14 Mesa Drive, Flagstaff, AZ 86001" },
  },
  {
    name: "check_warehouse_stock",
    description: "Checks inventory at each regional warehouse",
    parameters: {
      type: "object",
      properties: { product_sku: { type: "string" }, quantity: { type: "number" } },
      required: ["product_sku", "quantity"],
    },
    latencyRange: [50, 300],
    sampleArgs: { product_sku: "RSK-001", quantity: 2 },
    sampleResult: { desert: 42, mountain: 15, urban: 8, recommended: "desert" },
  },
  {
    name: "reserve_inventory",
    description: "Reserves product units for the order",
    parameters: {
      type: "object",
      properties: { product_sku: { type: "string" }, quantity: { type: "number" }, warehouse: { type: "string" } },
      required: ["product_sku", "quantity", "warehouse"],
    },
    latencyRange: [80, 400],
    sampleArgs: { product_sku: "RSK-001", quantity: 2, warehouse: "desert" },
    sampleResult: { reservation_id: "RES-20260405-001", expires: "2026-04-06T00:00:00Z" },
  },
  {
    name: "calculate_route",
    description: "Determines shipping route, avoiding known incident zones",
    parameters: {
      type: "object",
      properties: { origin_warehouse: { type: "string" }, destination: { type: "string" } },
      required: ["origin_warehouse", "destination"],
    },
    latencyRange: [60, 350],
    sampleArgs: { origin_warehouse: "desert", destination: "14 Mesa Drive, Flagstaff, AZ 86001" },
    sampleResult: { route_id: "RT-0892", distance_km: 210, estimated_hours: 18, incident_zones_avoided: 3 },
  },
  {
    name: "create_shipment",
    description: "Creates shipment record with carrier assignment",
    parameters: {
      type: "object",
      properties: { order_id: { type: "string" }, route_id: { type: "string" }, carrier: { type: "string" } },
      required: ["order_id", "route_id"],
    },
    latencyRange: [100, 500],
    sampleArgs: { order_id: "ACM-93821", route_id: "RT-0892", carrier: "Acme Ground" },
    sampleResult: { shipment_id: "SHP-20260405-001", tracking: "ACME-TRK-93821", status: "label_created" },
  },
  {
    name: "flag_hazmat",
    description: "Checks if the product requires hazardous materials handling",
    parameters: {
      type: "object",
      properties: { product_sku: { type: "string" } },
      required: ["product_sku"],
    },
    latencyRange: [30, 100],
    sampleArgs: { product_sku: "TNT-009" },
    sampleResult: { hazmat: true, level: "EXTREME", handling: "specialized_carrier", documentation_required: true },
  },
]

// -- Safety Reviewer tools --

export const SAFETY_REVIEWER_TOOLS: readonly ToolConfig[] = [
  {
    name: "search_incident_db",
    description: "RAG search over historical incident reports",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, product_sku: { type: "string" } },
      required: ["query"],
    },
    latencyRange: [80, 500],
    sampleArgs: { query: "roller skates unintended activation", product_sku: "RSK-001" },
    sampleResult: {
      incidents: [
        { id: "IR-2026-0847", severity: 3, product: "RSK-001", summary: "Skates activated without user input" },
        { id: "IR-2026-0501", severity: 2, product: "RSK-001", summary: "Skates failed to stop on downhill slope" },
      ],
    },
  },
  {
    name: "classify_severity",
    description: "Classifies severity from 1 (minor) to 5 (product achieved sentience)",
    parameters: {
      type: "object",
      properties: { description: { type: "string" }, product_sku: { type: "string" } },
      required: ["description"],
    },
    latencyRange: [40, 200],
    sampleArgs: { description: "Product self-activated and propelled itself off a mesa", product_sku: "RSK-001" },
    sampleResult: { severity: 3, label: "Unintended Activation", confidence: 0.91 },
  },
  {
    name: "lookup_product_recalls",
    description: "Checks existing recalls for the product",
    parameters: {
      type: "object",
      properties: { product_sku: { type: "string" } },
      required: ["product_sku"],
    },
    latencyRange: [50, 250],
    sampleArgs: { product_sku: "RSK-001" },
    sampleResult: {
      active_recalls: [{ lot: "RSK-001-2026-03", reason: "faulty ignition switch", date: "2026-03-01" }],
    },
  },
  {
    name: "generate_risk_summary",
    description: "Generates a structured risk report (internally calls an LLM)",
    parameters: {
      type: "object",
      properties: { incident_id: { type: "string" }, context: { type: "string" } },
      required: ["incident_id"],
    },
    latencyRange: [800, 3000],
    sampleArgs: { incident_id: "IR-2026-0847", context: "12 similar incidents in 90 days" },
    sampleResult: {
      risk_level: "HIGH",
      recommendation: "Issue recall for lots RSK-001-2026-02 through RSK-001-2026-04",
      corrective_action: "Replace ignition switch with dual-trigger mechanism",
    },
  },
]
