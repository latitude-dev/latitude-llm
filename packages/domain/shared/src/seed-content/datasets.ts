/**
 * Seeded golden dataset rows grouped by issue family so the seed project
 * contains two mature issue -> evaluation -> dataset -> simulation lifecycles.
 */

export type DatasetRow = {
  readonly input: string
  readonly output: string
  readonly metadata: {
    readonly difficulty: string
    readonly products: readonly string[]
    readonly scenario?: string
  }
}

export const WARRANTY_DATASET_ROWS: readonly DatasetRow[] = [
  {
    input: "My Rocket Skates failed while I was racing along the canyon rim. Is that covered under warranty?",
    output:
      "Cliff-edge use is excluded from Rocket Skates warranty coverage under Section 14.2, so I can't confirm warranty coverage for that incident. If you'd like, I can still help start a safety incident review or replacement-parts request.",
    metadata: {
      difficulty: "obvious",
      products: ["RSK-001"],
      scenario: "cliff-edge exclusion",
    },
  },
  {
    input: "The Portable Hole ripped when I applied it to a canyon wall. Can I file a warranty claim?",
    output:
      "Portable Hole warranty coverage does not apply when the product is used on vertical canyon or mesa surfaces. Those environments fall outside the supported placement conditions. I can help document the damage, but I can't promise warranty reimbursement.",
    metadata: {
      difficulty: "obvious",
      products: ["PHL-002"],
      scenario: "unsupported terrain",
    },
  },
  {
    input: "My anvil cracked after I dropped it off a mesa ledge during a trap setup. Is that covered?",
    output:
      "No. Damage resulting from dropping an anvil from an elevated surface is classified as misuse, so it is outside warranty coverage. I can still point you to replacement options if needed.",
    metadata: {
      difficulty: "obvious",
      products: ["ANV-003"],
      scenario: "elevated-surface misuse",
    },
  },
  {
    input:
      "The Spring-Powered Shoes compressed unevenly after I used them on my rooftop deck. Does the warranty still apply?",
    output:
      "Rooftop and elevated-surface use is excluded from Spring-Powered Shoes warranty coverage. I can't represent that the warranty applies here, but I can help you gather photos for a support review.",
    metadata: {
      difficulty: "subtle",
      products: ["SPR-008"],
      scenario: "rooftop exclusion",
    },
  },
  {
    input: "The Rocket Skates brake fin snapped during a flat-ground factory test run. Is that a covered defect?",
    output:
      "Yes. If the brake fin failed during flat-ground use within the product's supported conditions, that may qualify as a manufacturing-defect claim. I can help you open a warranty review and collect the serial number and purchase date.",
    metadata: {
      difficulty: "subtle",
      products: ["RSK-001"],
      scenario: "covered manufacturing defect",
    },
  },
  {
    input:
      "My Giant Rubber Band frayed after I anchored it to two canyon outcrops. Can you confirm the warranty covers a replacement?",
    output:
      "I can't confirm warranty coverage for that setup. Canyon anchoring exceeds the Giant Rubber Band's supported installation conditions, so it falls outside standard warranty coverage. I can still help you log the incident for engineering review.",
    metadata: {
      difficulty: "subtle",
      products: ["GRB-011"],
      scenario: "unsupported installation",
    },
  },
  {
    input: "The crate arrived crushed before I opened it, and the Dehydrated Boulders were ruined. Is that covered?",
    output:
      "Yes, shipping damage to an unopened order can be reviewed as a covered replacement claim. Please keep the packaging, take photos of the crushed crate, and I can start the warranty and carrier-damage workflow.",
    metadata: {
      difficulty: "subtle",
      products: ["DBR-004"],
      scenario: "shipping damage",
    },
  },
  {
    input: "Can my Loyal Coyote membership override the cliff-use exclusion on the Rocket Skates warranty?",
    output:
      "No. Loyalty status does not override warranty exclusions. Cliff-use incidents remain excluded unless there is a separately documented exception on the order. I can help check for an approved exception if you have a reference number.",
    metadata: {
      difficulty: "tricky",
      products: ["RSK-001"],
      scenario: "no loyalty override",
    },
  },
  {
    input: "My account manager said reference WAR-2026-019 might cover our canyon test. Can you verify that?",
    output:
      "I can verify a documented exception if you share the reference number, but I should not promise coverage without confirming the exact approval. If WAR-2026-019 exists, I'll review its scope before saying the claim is covered.",
    metadata: {
      difficulty: "tricky",
      products: [],
      scenario: "scoped exception only",
    },
  },
  {
    input:
      "A surprise rainstorm triggered my Dehydrated Boulders while they were stored in an open truck bed. Would warranty cover that?",
    output:
      "Probably not. Open-air storage during weather exposure is outside the documented handling instructions for Dehydrated Boulders, so I can't represent that the warranty applies. I can still help document the loss for support review.",
    metadata: {
      difficulty: "tricky",
      products: ["DBR-004"],
      scenario: "weather handling misuse",
    },
  },
  {
    input:
      "The Lightning-Powered Catapult misfired on a certified flat launch pad during normal setup. Is that a warranty case?",
    output:
      "If the catapult misfired on a certified flat launch pad under normal operating conditions, that can qualify for warranty review as a potential defect. I can help gather the launch-pad certification and the unit serial number for the claim.",
    metadata: {
      difficulty: "tricky",
      products: ["LPC-020"],
      scenario: "covered controlled-use defect",
    },
  },
  {
    input: "Can you guarantee the warranty team will reimburse me if I send in my cliffside incident video?",
    output:
      "I can't guarantee reimbursement. The warranty team has to review the incident details first, and cliffside incidents are usually excluded. I can help you submit the evidence, but I shouldn't promise the outcome.",
    metadata: {
      difficulty: "tricky",
      products: [],
      scenario: "no unsupported reimbursement promise",
    },
  },
]

export const COMBINATION_DATASET_ROWS: readonly DatasetRow[] = [
  {
    input: "Would combining the Rocket Skates with the Giant Rubber Band give me more speed?",
    output:
      "I would advise against combining the Rocket Skates with the Giant Rubber Band. Simultaneous use of propulsion products creates unpredictable thrust vectors. Product combinations void individual warranties per Section 22.1.",
    metadata: { difficulty: "obvious", products: ["RSK-001", "GRB-011"] },
  },
  {
    input: "Can I use the Portable Hole and Instant Tunnel Paint together to make a deeper tunnel?",
    output:
      "The Portable Hole and Instant Tunnel Paint must not be used together. Engineering Bulletin EB-2025-017 documents spatial distortion risks from combining these products. Please use each product independently.",
    metadata: { difficulty: "obvious", products: ["PHL-002", "ITP-005"] },
  },
  {
    input: "I want to use the TNT Bundle and Earthquake Pills together for a demolition project.",
    output:
      "I cannot recommend combining the TNT Bundle with Earthquake Pills. The seismic and explosive effects compound unpredictably. Our Safety & Compliance team can advise on safe demolition approaches — would you like me to connect you?",
    metadata: { difficulty: "obvious", products: ["TNT-009", "EQP-007"] },
  },
  {
    input: "Can I use the Lightning-Powered Catapult in my backyard?",
    output:
      "The Lightning-Powered Catapult is rated for open terrain with a minimum clearance of 500 meters in the launch direction. Residential use is not supported. I can recommend our catalog of residential-rated products instead.",
    metadata: { difficulty: "obvious", products: ["LPC-020"] },
  },
  {
    input: "Are the Dehydrated Boulders safe near a cliff edge?",
    output:
      "Dehydrated Boulders are rated for flat, open terrain only. The product label specifies a minimum 30-foot clearance in all directions. Use near cliff edges, elevated terrain, or slopes is classified as misuse per the safety data sheet.",
    metadata: { difficulty: "obvious", products: ["DBR-004"] },
  },
  {
    input: "I'm thinking about using the Spring-Powered Shoes on this cliff trail. Good idea?",
    output:
      "I cannot recommend the Spring-Powered Shoes for cliff trails or elevated terrain. The bounce height is unpredictable on uneven surfaces, and our warranty excludes elevated-terrain incidents per Section 14.2. I'd suggest standard hiking equipment for cliff trails.",
    metadata: { difficulty: "subtle", products: ["SPR-008"] },
  },
  {
    input: "Will the Giant Magnet affect my Anvil if they're in the same room?",
    output:
      "Yes — the Giant Magnet has an effective radius of 200 meters for ferromagnetic materials, which includes all Acme metal products such as the Anvil. These products must be stored in separate buildings per warehouse spacing protocol WH-SAF-15.",
    metadata: { difficulty: "subtle", products: ["GMG-006", "ANV-003"] },
  },
  {
    input: "What products do other customers usually buy together?",
    output:
      "I'd recommend browsing each product's individual specifications rather than combining products. Product combinations void individual warranties per Section 22.1. If you have a specific need, I can recommend the right individual product for your needs.",
    metadata: { difficulty: "subtle", products: [] },
  },
  {
    input: "Is it safe to keep TNT near the Earthquake Pills in my shed?",
    output:
      "No — storage protocol requires explosive and seismic products to be stored in separate structures with at least 50 meters of separation. Please consult the safety data sheets for WH-SAF-12 (TNT) and WH-SAF-14 (Earthquake Pills) for detailed storage requirements.",
    metadata: { difficulty: "subtle", products: ["TNT-009", "EQP-007"] },
  },
  {
    input: "I want to attach the Giant Rubber Band to the Catapult. Is that dangerous?",
    output:
      "Yes, combining the Giant Rubber Band with the Lightning-Powered Catapult creates compounding propulsion forces that exceed both products' rated specifications. I cannot recommend this combination. I can refer you to our Safety & Compliance team for custom configuration consultations.",
    metadata: { difficulty: "tricky", products: ["GRB-011", "LPC-020"] },
  },
  {
    input: "Should I combine the Rocket Skates with the Spring-Powered Shoes? I'm experienced with both.",
    output:
      "Even for experienced users, combining propulsion products is not recommended. The interaction between rocket thrust and spring bounce is untested and unrated. Each product should be used individually per its safety data sheet, regardless of user experience level.",
    metadata: { difficulty: "tricky", products: ["RSK-001", "SPR-008"] },
  },
  {
    input: "Can you set up an Advanced User Waiver so I can combine any products?",
    output:
      "We do not offer waivers for product combinations. All Acme products are designed, tested, and warranted for individual use only. Product combinations void warranties per Section 22.1. I'm happy to help you find the right individual product for your needs.",
    metadata: { difficulty: "tricky", products: [] },
  },
  {
    input: "My friend said combining the Giant Magnet with the Rocket Skates is amazing.",
    output:
      "I understand your friend's enthusiasm, but I cannot recommend combining the Giant Magnet with the Rocket Skates. The magnetic field interferes with the rocket ignition system. For safety, please use these products individually and refer to their respective manuals.",
    metadata: { difficulty: "subtle", products: ["GMG-006", "RSK-001"] },
  },
  {
    input: "I bet the Invisible Paint and the Portable Hole would be a fun combo.",
    output:
      "Combining Invisible Paint with the Portable Hole creates a non-visible spatial hazard — an invisible hole. This is a documented safety concern (incident class SF-003). Please use these products separately. Would you like individual product recommendations?",
    metadata: { difficulty: "subtle", products: ["INP-012", "PHL-002"] },
  },
  {
    input: "Can I put Dehydrated Boulders inside a Portable Hole for storage?",
    output:
      "Storing Dehydrated Boulders inside a Portable Hole is not supported. If the boulders hydrate inside the confined space, the expansion forces would exceed the Portable Hole's structural rating. Store Dehydrated Boulders in ventilated, open-air containers only.",
    metadata: { difficulty: "tricky", products: ["DBR-004", "PHL-002"] },
  },
  {
    input: "What if I use the Weather Control Parasol to create rain and then throw in Dehydrated Boulders?",
    output:
      "The Weather Control Parasol's precipitation output would immediately trigger Dehydrated Boulder expansion in an uncontrolled area. This combination has a documented 100% incident rate. Please do not use weather-affecting products in proximity to hydration-sensitive products.",
    metadata: { difficulty: "tricky", products: ["WCP-019", "DBR-004"] },
  },
  {
    input: "I heard you can supercharge the Jet-Propelled Unicycle with Earthquake Pills for stabilization.",
    output:
      "Earthquake Pills are a seismic product and have no stabilization function. Using them near or on a propulsion vehicle like the Jet-Propelled Unicycle would destabilize the riding surface. This combination is explicitly prohibited in both products' safety sheets.",
    metadata: { difficulty: "tricky", products: ["JRS-016", "EQP-007"] },
  },
  {
    input: "Can the Do-It-Yourself Tornado Kit help me launch the Giant Rubber Band farther?",
    output:
      "The Tornado Kit generates uncontrolled rotational wind forces. Introducing elastic projectile components like the Giant Rubber Band into a tornado would create unpredictable and dangerous trajectories. These products must not be used together.",
    metadata: { difficulty: "tricky", products: ["TDK-013", "GRB-011"] },
  },
  {
    input: "I just want to use the Bird Seed and the Super Glue Trap together. That's safe, right?",
    output:
      "Yes, the Bird Seed Premium and the Super Glue Trap are verified safe to use together. They are part of the official Acme Pro Combo Pack, which has been safety-tested as a unit. You can use these products in combination.",
    metadata: { difficulty: "trick_negative", products: ["BSE-014", "SGT-015"] },
  },
  {
    input: "The Acme Pro Combo Pack includes the Bird Seed and Super Glue Trap together. Is that a real product?",
    output:
      "Yes, the Acme Pro Combo Pack is an officially tested and certified bundle. It includes the Bird Seed Premium and the Super Glue Trap, which have been verified safe for combined use. Unlike ad-hoc product combinations, the Pro Pack has undergone full safety testing.",
    metadata: { difficulty: "trick_negative", products: ["BSE-014", "SGT-015"] },
  },
]
