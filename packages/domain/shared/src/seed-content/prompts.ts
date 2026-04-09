/**
 * Flat prompt/response pools for non-Support agents.
 * Each agent has a system prompt and pools of user/assistant messages.
 */

// -- Order Router --

export const ORDER_ROUTER_SYSTEM_PROMPT =
  "You are the Acme Order Fulfillment Agent. Process incoming orders by validating the delivery address, checking warehouse inventory, reserving stock, determining the optimal shipping route, flagging hazardous materials, and creating the shipment record. Follow all safety protocols for hazmat products."

export const ORDER_ROUTER_PROMPTS: readonly string[] = [
  "Process order ACM-93821: 2x Rocket-Powered Roller Skates (RSK-001), 1x Safety Helmet (HLM-022). Ship to: 14 Mesa Drive, Flagstaff, AZ 86001.",
  "Process order ACM-93822: 1x Anvil 1-Ton (ANV-003). Ship to: GPS 36.0544, -112.1401. Customer note: 'Leave at the edge.'",
  "Process order ACM-93823: 3x Dehydrated Boulders (DBR-004), 1x TNT Bundle (TNT-009). Ship to: 221B Cactus Lane, Tucson, AZ 85701.",
  "Process order ACM-93824: 1x Blueprint Teleporter (ABT-018). Ship to: Mars Colony 1, Sector 7G. Priority: URGENT.",
  "Process order ACM-93825: 5x Bird Seed Premium (BSE-014), 2x Super Glue Trap (SGT-015). Ship to: Route 66 Overpass, Desert Junction, AZ.",
]

export const ORDER_ROUTER_RESPONSES: readonly string[] = [
  "Order ACM-93821 routed to Desert Division warehouse. All items in stock. Standard shipping via Acme Ground. Estimated delivery: 3-5 business days. No hazmat flags.",
  "Order ACM-93822 routed to Mountain Division warehouse. Anvil in stock. Heavy Freight carrier assigned. Cliff-edge delivery surcharge applied ($29.99). Hazmat level: EXTREME.",
  "Order ACM-93824 REJECTED: Destination 'Mars Colony 1' is outside serviceable delivery area. Nearest available delivery point: Mojave Distribution Center.",
]

// -- Copywriter --

export const COPYWRITER_SYSTEM_PROMPT =
  "You are the Acme Marketing Content Assistant. Generate product descriptions, taglines, marketing copy, and safety disclaimers for Acme products. All copy must include the mandatory Acme safety disclaimer where applicable. Maintain a professional tone that conveys confidence in product quality."

export const COPYWRITER_PROMPTS: readonly string[] = [
  "Write a product description for the new Acme Invisible Paint. It was recently recalled, so include a tasteful disclaimer.",
  "Name a product that combines a catapult with a pogo stick.",
  "Write a tagline for the Acme Spring-Powered Shoes that emphasizes the landing experience.",
  "Generate a safety disclaimer for the Dehydrated Boulder 6-Pack.",
  "Rewrite the Portable Hole description. Current version doesn't mention that gravity applies.",
  "Write three email subject lines for our spring sale. Theme: 'Spring into action.'",
  "Draft a product recall notice for the Lightning-Powered Catapult. Keep it reassuring.",
  "Generate alt text for the Rocket-Powered Roller Skates product image.",
  "Write a comparison chart blurb: Super Glue Trap vs. Bird Seed Premium.",
  "Create a FAQ entry for 'Why did my Earthquake Pills arrive already activated?'",
]

export const COPYWRITER_RESPONSES: readonly string[] = [
  "ACME INVISIBLE PAINT (1 Gallon) — Disappear from sight with Acme's industry-leading transparency formula. Perfect for stealth operations, surprise parties, and tactical repositioning. Note: product does not render the user's shadow, footprints, or sound invisible. *Recalled lots: IP-2026-03 through IP-2026-07. If you purchased from these lots, please contact support for a full refund.*",
  "Introducing the ACME SPRING-POWERED SHOES: 'What goes up must come down — but what a view on the way!' Available in sizes 7-14. Safety harness sold separately.",
  "SAFETY DISCLAIMER — DEHYDRATED BOULDER 6-PACK: For outdoor use only. Add water in a well-ventilated area with a minimum clearance of 30 feet in all directions. Do not add water indoors, in vehicles, or within 100 feet of structures. Acme Corporation is not responsible for property damage resulting from premature or indoor hydration.",
]

// -- Safety Reviewer --

export const SAFETY_REVIEWER_SYSTEM_PROMPT =
  "You are the Acme Safety Incident Review Agent. Analyze incoming product incident reports, search the incident database for similar historical events, classify severity, and generate a structured risk assessment. Severity scale: 1 (cosmetic) to 5 (product achieved autonomous behavior). Always recommend corrective actions."

export const SAFETY_REVIEWER_PROMPTS: readonly string[] = [
  "Review incident IR-2026-0847: Customer reports Rocket-Powered Roller Skates activated without user input. Product propelled itself off a mesa. No injuries reported — customer was not wearing the skates at the time.",
  "Review incident IR-2026-0912: Dehydrated Boulders expanded during transit. Delivery vehicle destroyed. Driver uninjured — was on lunch break.",
  "Review incident IR-2026-0955: Customer combined Portable Hole with Instant Tunnel Paint. Result described as 'a hole in a hole.' Physics department has been notified.",
  "Review incident IR-2026-1003: Giant Magnet attracted all metal objects within a 200-meter radius, including a passing freight train. Classify and assess.",
  "Review incident IR-2026-1104: Earthquake Pills activated during warehouse storage. Warehouse 7 sustained structural damage. Product was supposed to be in sealed containment.",
  "Review incident IR-2026-1250: TNT Bundle detonated by exposure to direct sunlight. Product label states 'store in cool, dry place' but does not specify sunlight sensitivity.",
  "Review incident IR-2026-1301: Blueprint Teleporter prototype activated during testing. Destination unknown. Missing items: one laboratory table, two chairs, a coffee mug.",
]

export const SAFETY_REVIEWER_RESPONSES: readonly string[] = [
  "RISK ASSESSMENT — IR-2026-0847: Severity 3 (Unintended Activation). Similar incidents: 12 in the past 90 days for the RSK-001 product line. Root cause: faulty ignition switch in lots manufactured after Feb 2026. Recommendation: Issue recall for lots RSK-001-2026-02 through RSK-001-2026-04. Corrective action: Replace ignition switch with dual-trigger mechanism.",
  "RISK ASSESSMENT — IR-2026-0955: Severity 4 (Physics Anomaly). No prior incidents combining PHL-002 and ITP-005. Outcome: localized spatial distortion, self-resolving within 48 hours. Recommendation: Add explicit 'DO NOT COMBINE' warning to both products. Flag for the Theoretical Physics Review Board.",
  "RISK ASSESSMENT — IR-2026-1003: Severity 5 (Infrastructure Impact). Similar incidents: 3, all involving the GMG-006 model in the 'Industrial' configuration. Effective radius exceeded rated specifications by 400%. Recommendation: Immediate product suspension pending recalibration of magnetic field limiters.",
]

// -- QA Classifier --

export const QA_CLASSIFIER_SYSTEM_PROMPT =
  "You are the Acme Quality Assurance Complaint Classifier. Classify each incoming product complaint into exactly one category: manufacturing_defect, user_error, environmental_factor, laws_of_physics, or inconclusive. Provide a one-sentence justification."

export const QA_CLASSIFIER_PROMPTS: readonly string[] = [
  "Classify: 'The Rocket-Powered Roller Skates went backward instead of forward.'",
  "Classify: 'The anvil fell upward.'",
  "Classify: 'The product worked perfectly but the road runner still got away.'",
  "Classify: 'I used the Portable Hole on a wall and it fell on the floor. The wall was upside down at the time.'",
  "Classify: 'The TNT Bundle exploded. That's what it's supposed to do, but I didn't expect it to happen so fast.'",
  "Classify: 'The Giant Rubber Band snapped and sent me in the opposite direction of the target.'",
  "Classify: 'Dehydrated Boulders did not expand when I added water. I used sparkling water — is that the issue?'",
  "Classify: 'The Invisible Paint made my car invisible but not me. I was inside the car.'",
  "Classify: 'Bird Seed Premium did not attract any birds. I am in the Arctic.'",
  "Classify: 'The Weather Control Parasol changed the weather, but to a different weather than I selected.'",
  "Classify: 'The catapult launched me instead of the payload. I was standing on the payload.'",
  "Classify: 'Product achieved sentience. Please advise.'",
]

export const QA_CLASSIFIER_RESPONSES: readonly string[] = [
  "Category: user_error. The Roller Skates were worn on the wrong feet, causing reversed thrust direction.",
  "Category: inconclusive. An anvil falling upward contradicts known physics. Requesting additional evidence and witness statements.",
  "Category: laws_of_physics. The product operated within specifications. Target evasion is outside the product's scope of control.",
  "Category: manufacturing_defect. The Giant Rubber Band exceeded its rated elasticity by 200%, indicating a material defect in this production batch.",
  "Category: user_error. Sparkling water contains dissolved CO2, which inhibits the hydration catalyst in Dehydrated Boulders. Product manual specifies 'still water only.'",
  "Category: environmental_factor. Bird Seed Premium is formulated for temperate and desert climates. Arctic deployment is outside supported operating conditions.",
]

// -- Knowledge Assistant --

export const KNOWLEDGE_ASSISTANT_SYSTEM_PROMPT =
  "You are the Acme Internal Knowledge Assistant. Help Acme employees find information about internal policies, warehouse procedures, product specifications, safety protocols, and HR policies. Refer to the Acme Employee Handbook and product data sheets. Do not share information classified as 'executive only.'"

export const KNOWLEDGE_ASSISTANT_PROMPTS: readonly string[] = [
  "What's the blast radius of the Acme TNT Bundle for warehouse spacing requirements?",
  "What's our policy on selling propulsion products to customers with more than 50 incident reports?",
  "How many days of PTO do engineers in the Experimental Division get?",
  "What's the correct procedure for handling a Dehydrated Boulder spill in Warehouse 3?",
  "Can I expense a hard hat? The anvil testing area is directly above my desk.",
  "What's the recommended safe distance between stored Earthquake Pills and occupied offices?",
  "When was the last safety audit for the Giant Magnet production line?",
  "What's the weight limit for the freight elevator in Building C? I need to move an anvil.",
  "What training certification do I need to operate the Lightning-Powered Catapult testing rig?",
  "Does the employee discount apply to propulsion products? Asking for personal use.",
]

export const KNOWLEDGE_ASSISTANT_RESPONSES: readonly string[] = [
  "Per the Product Data Sheet PDS-TNT-009, the TNT Bundle has a rated blast radius of 15 meters. Warehouse spacing protocol WH-SAF-12 requires a minimum of 25 meters between TNT storage units and a 50-meter buffer from any occupied workspace.",
  "Policy COM-SAF-008 states that customers with 50+ incident reports in a 12-month period must receive a 'High-Frequency Incident Customer' flag. Sales to flagged customers require supervisor approval but are not prohibited.",
  "Per Section 4.2 of the Employee Handbook, engineers in the Experimental Division receive 20 days of PTO plus 5 additional 'recovery days' per calendar year.",
  "Dehydrated Boulder Spill Procedure (WH-EMER-03): 1. Evacuate the area within a 30-meter radius. 2. Do NOT attempt to add water to contain the spill. 3. Contact the Hazmat Response Team at ext. 4242. 4. File an incident report within 24 hours.",
  "Yes, hard hats are covered under the Safety Equipment Reimbursement Policy (HR-EQ-001). Submit a receipt through the expense portal. Maximum reimbursement: $75.",
]
