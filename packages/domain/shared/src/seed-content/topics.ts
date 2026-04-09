export type ConversationTopic = {
  readonly name: string
  readonly dominantPattern: "simple_chat" | "tool_call" | "rag" | "multi_step"
  readonly dominantTools?: readonly string[]
  readonly openingPrompts: readonly string[]
  readonly followUpPrompts: readonly string[]
  readonly openingResponses: readonly string[]
  readonly followUpResponses: readonly string[]
}

export const SUPPORT_AGENT_TOPICS: readonly ConversationTopic[] = [
  {
    name: "Order Status",
    dominantPattern: "tool_call",
    dominantTools: ["lookup_order"],
    openingPrompts: [
      "Can you check the status of order ACM-78432? I need the Giant Magnet before Tuesday.",
      "Where is my package? It was supposed to arrive yesterday.",
      "I placed an order three weeks ago and it still says 'processing'. What's going on?",
      "My tracking number isn't working. Can you look up order ACM-91205?",
    ],
    followUpPrompts: [
      "Can you give me a more specific delivery window?",
      "What if it doesn't arrive by Friday? I have plans that require a Giant Rubber Band.",
      "Can you upgrade the shipping? I'll pay extra.",
      "Actually, can you also check on my other order? The one with the Portable Hole.",
      "Is there a way to pick it up from your warehouse instead?",
    ],
    openingResponses: [
      "I've found your order ACM-78432. It's currently at the Desert Junction sorting facility. Estimated delivery is between tomorrow and Thursday, weather permitting.",
      "Let me pull up your order. I can see it shipped three days ago and is currently in transit through the Arizona corridor.",
      "Your order ACM-91205 is showing a status of 'awaiting hazmat clearance.' The TNT Bundle requires additional safety documentation before it can ship.",
    ],
    followUpResponses: [
      "I can upgrade your shipping to Acme Express for an additional $12.99. Delivery would be within 2 business days, cliff-edge access permitting.",
      "Unfortunately, our Desert Junction warehouse doesn't offer customer pickup. The insurance requirements for on-site visits are... substantial.",
      "Your other order is also in transit. The Portable Hole (3-pack) shipped separately from the Dehydrated Boulders for safety reasons.",
    ],
  },
  {
    name: "Warranty Claim",
    dominantPattern: "multi_step",
    dominantTools: ["check_warranty", "process_return", "create_support_ticket"],
    openingPrompts: [
      "My Rocket-Powered Roller Skates launched me off a cliff instead of forward. Is this covered by warranty?",
      "The Portable Hole opened under me instead of on the wall. I need a replacement.",
      "The Dehydrated Boulders expanded too early and destroyed my living room. I followed the instructions exactly.",
      "Your Bat-Man Outfit doesn't actually let me fly. The product page clearly shows flying.",
      "The Giant Magnet attracted my own car instead of the target. This is a defect.",
    ],
    followUpPrompts: [
      "But I followed the instructions exactly! Well, mostly.",
      "What does Section 14.2 actually say? I want to read the full clause.",
      "Can I speak to a supervisor about this? I've been a customer for decades.",
      "What if I can prove the cliff wasn't involved? It was more of a mesa.",
      "Fine, but I want it on record that I'm not satisfied.",
      "What about store credit instead of a refund?",
    ],
    openingResponses: [
      "I've checked your warranty for the Rocket-Powered Roller Skates. Unfortunately, Section 14.2 of the Acme Warranty Policy excludes coverage for 'incidents involving cliffs, mesas, canyons, or any elevated terrain from which the user may descend rapidly and involuntarily.'",
      "The Portable Hole is covered under our 30-day satisfaction guarantee. However, Section 7(b) notes that 'directional placement is the responsibility of the user.' I can process an exchange if you'd like.",
      "I'm sorry about the Dehydrated Boulders. Let me check — the warranty covers manufacturing defects, but indoor use is specifically noted as misuse on the product label. Let me see what I can do.",
    ],
    followUpResponses: [
      "I understand your frustration. I'm escalating this to a senior support representative who can review the specifics of your case. You should hear back within 2 business days.",
      "Section 14.2 in full states: 'Coverage excludes damage resulting from use of any Acme propulsion, elevation, or gravity-adjacent product in proximity to natural or man-made precipices.' I can email you the full warranty document.",
      "I can offer store credit of 75% of the purchase price as a goodwill gesture. This would be applied to your account immediately.",
    ],
  },
  {
    name: "Return / Refund",
    dominantPattern: "tool_call",
    dominantTools: ["process_return"],
    openingPrompts: [
      "I need to return the Instant Tunnel Paint. I painted it on a rock and ran straight into the rock.",
      "I want a refund for the Earthquake Pills. They worked too well.",
      "Can I return the Female Road Runner Decoy? It attracted a coyote instead.",
      "I'd like to return an anvil. It's in... slightly used condition.",
    ],
    followUpPrompts: [
      "What's the return shipping process? The product is heavy.",
      "How long until I get my refund?",
      "Can I exchange it for a different size instead? The 1-Ton model is too light.",
      "The return label says 'affix to package.' The package is a boulder.",
    ],
    openingResponses: [
      "I can process a return for the Instant Tunnel Paint. Our return policy requires the product to be in its original packaging. Do you still have the can?",
      "I've initiated a return for the Earthquake Pills. Since the product was opened and used, a 25% restocking fee applies per our hazardous materials return policy.",
      "I'm sorry the Decoy didn't meet your expectations. I can process a full return since it's within our 30-day window.",
    ],
    followUpResponses: [
      "For items over 50 lbs, we arrange a carrier pickup at no extra charge. I'll schedule that for you — please have the product in a stable location. Away from cliffs, preferably.",
      "Refunds typically process within 5-7 business days after we receive the return. You'll get an email confirmation.",
      "We do offer the Anvil in 2-Ton and 5-Ton models. I can set up an exchange — you'd just pay the price difference.",
    ],
  },
  {
    name: "Product Recommendation",
    dominantPattern: "rag",
    dominantTools: ["search_product_catalog"],
    openingPrompts: [
      "What do you recommend for catching a very fast bird? Budget is not a concern.",
      "I need something that works better than the last 47 products I bought from you.",
      "What's your most reliable propulsion product? And be honest.",
      "I'm looking for something in the trap category. Something foolproof.",
      "Do you have anything new? I've tried everything in your current catalog.",
    ],
    followUpPrompts: [
      "What about combining it with the Giant Rubber Band? Would that increase effectiveness?",
      "Does it come with any kind of performance guarantee?",
      "What's the incident rate on that product?",
      "You know what, just add the Super Glue Trap to my cart too.",
      "What's the return policy if it doesn't work? Because it won't.",
    ],
    openingResponses: [
      "Based on your requirements, I'd recommend the Acme Super Glue Trap (XL). It has our highest customer satisfaction rating in the trap category at 12%, which is actually quite good for our product line.",
      "For propulsion, the Jet-Propelled Unicycle has been our most reliable recent product. It has a 34% success rate in controlled testing environments. Note: testing was not conducted near cliffs.",
      "We recently launched the Lightning-Powered Catapult. Early reviews are mixed, but it does deliver impressive range. Safety goggles are included.",
    ],
    followUpResponses: [
      "I would advise against combining products, as compound usage voids all individual warranties. That said, I cannot stop you. And historically, I have not been able to stop you.",
      "Our performance guarantee covers manufacturing defects only. 'The target was too fast' is not classified as a defect.",
      "The incident rate for the Super Glue Trap is 73%, though most incidents involve the purchaser rather than the intended target.",
    ],
  },
  {
    name: "Shipping Inquiry",
    dominantPattern: "tool_call",
    dominantTools: ["calculate_shipping"],
    openingPrompts: [
      "Can I get expedited shipping to Mesa Top, Arizona? The roads are limited.",
      "Do you deliver to cliff-edge addresses? I need the package left at the very edge.",
      "What's the shipping cost for a 1-Ton Anvil to the middle of the desert?",
      "How long does international shipping take? Specifically to Mars Colony 1.",
    ],
    followUpPrompts: [
      "What's the cliff-edge delivery surcharge?",
      "Can the driver leave it at the base of the mesa instead? I'll haul it up.",
      "Is there a flat rate option for frequent orders? I order almost weekly.",
      "What if I pick it up at the nearest distribution center?",
    ],
    openingResponses: [
      "Standard shipping to Mesa Top, Arizona is $14.99 with an estimated delivery of 5-7 business days. There is a $29.99 surcharge for cliff-edge delivery due to specialized equipment requirements.",
      "Shipping a 1-Ton Anvil to a desert location runs $89.99 via our Heavy Freight service. We do require GPS coordinates since there's no street address.",
      "We currently do not support interplanetary shipping. Our logistics team has flagged this as a feature request. In the meantime, the nearest available delivery point is our Mojave distribution center.",
    ],
    followUpResponses: [
      "We do offer the Acme Frequent Shipper program — after your 100th order in a calendar year, you receive free standard shipping. Based on your account, you qualified in February.",
      "Base-of-mesa delivery is available at no surcharge. Please note that Acme is not liable for any incidents that occur during vertical transport of the product by the customer.",
    ],
  },
  {
    name: "Billing Dispute",
    dominantPattern: "tool_call",
    dominantTools: ["lookup_order"],
    openingPrompts: [
      "I was charged for an anvil that fell on ME. I demand a billing adjustment.",
      "Why is there a 'cliff-edge delivery surcharge' on my invoice? I live in a valley.",
      "I was double-charged for the same order. Can you fix this?",
      "My invoice shows a 'hazmat handling fee' for Bird Seed. That's just seeds.",
    ],
    followUpPrompts: [
      "I never agreed to that surcharge. Remove it.",
      "Can you email me an itemized invoice?",
      "I want to dispute this with my credit card company. What's your merchant ID?",
      "Fine, but can you apply a credit to my account for the trouble?",
    ],
    openingResponses: [
      "I've pulled up your invoice. The charge for the Anvil (1-Ton) is $199.99 plus $89.99 heavy freight shipping. The product was delivered successfully to the coordinates you provided. Subsequent gravitational events are not reflected on the invoice.",
      "I see the cliff-edge surcharge on your order. Let me verify your delivery address — it shows coordinates 36.0544°N, 112.1401°W, which our system classified as a canyon rim. I'll review whether this was applied correctly.",
      "I can confirm the duplicate charge. I'll process a refund for the second charge of $49.99. You should see it back on your card within 5-7 business days.",
    ],
    followUpResponses: [
      "I've applied a $15.00 account credit as a goodwill gesture. It will be applied automatically to your next order.",
      "I'll email you an itemized invoice within the hour. It will include all line items, surcharges, and the applicable warranty exclusions for reference.",
    ],
  },
  {
    name: "Product Question",
    dominantPattern: "simple_chat",
    dominantTools: ["search_product_catalog"],
    openingPrompts: [
      "Does the Bat-Man Outfit actually let me fly? The product page clearly shows flying.",
      "What's the blast radius of the TNT Bundle?",
      "How fast do the Rocket-Powered Roller Skates go? And what's the stopping distance?",
      "Are the Dehydrated Boulders dishwasher safe?",
      "What batteries does the Giant Magnet use?",
    ],
    followUpPrompts: [
      "What about in a confined canyon? Does the blast radius change?",
      "Is there a lighter version that's less... catastrophic?",
      "What safety equipment do you recommend using with it?",
      "Can it be used indoors? Asking for insurance purposes.",
    ],
    openingResponses: [
      "The Bat-Man Outfit provides a gliding experience from elevated positions. The product page image depicts the optimal use scenario. Sustained powered flight is not a feature of this product. The fine print on the listing notes: 'Not actual flight. Acme is not responsible for altitude-related expectations.'",
      "The TNT Bundle (10-Pack) has a rated blast radius of 15 meters in open terrain. Confined spaces may amplify the effect. Full safety specifications are available in the product data sheet.",
      "The Rocket-Powered Roller Skates reach a top speed of 85 mph under test conditions. Stopping distance varies by terrain. The product manual recommends 'a flat, unobstructed surface with no cliffs within a 2-mile radius.'",
    ],
    followUpResponses: [
      "In a confined canyon, the effective radius could increase by 40-60% due to acoustic and pressure amplification. We recommend a minimum safe distance of 25 meters in such environments.",
      "We do offer the TNT Lite (3-Pack) with a reduced blast radius of 5 meters. It's rated for residential use in jurisdictions where Acme products are not banned.",
    ],
  },
  {
    name: "General Complaint",
    dominantPattern: "simple_chat",
    openingPrompts: [
      "I've been a loyal customer for 47 years and nothing has ever worked as advertised.",
      "Your products have a 100% failure rate in my experience. All 847 orders.",
      "Every single product I've bought has either exploded, backfired, or fallen on me.",
      "I'm starting to think the problem isn't your products. But it definitely is your products.",
    ],
    followUpPrompts: [
      "Why do I keep ordering then? Good question. I wish I had an answer.",
      "Fine, what's new this season? Anything that actually works?",
      "Do you have a loyalty program? After 847 orders I should be getting something.",
      "You know what, forget it. I'll take two of the Rocket-Powered Roller Skates.",
    ],
    openingResponses: [
      "I appreciate your loyalty and honesty, and I understand your frustration. Our records do show 847 orders on your account, and our customer success team has flagged your account for our new Dedicated Support tier.",
      "I hear you, and I want to help. We've made significant improvements to our product line this year. Our new testing facility has reduced the unintended-cliff-departure rate by 4%.",
      "Your feedback is valued and has been shared with our product team. As a gesture of appreciation for your continued patronage, I've applied a 10% Loyal Customer discount to your account.",
    ],
    followUpResponses: [
      "Our Loyal Coyote Program activates after 500 orders — which you've long since qualified for. It includes 10% off all orders, priority support, and complimentary hazard insurance up to $500 per incident.",
      "This season we're featuring the Weather Control Parasol and the Blueprint Teleporter. Early testing results are — let me check — 'promising but inconclusive.' Would you like to hear more?",
      "Two pairs of Rocket-Powered Roller Skates, noted. Would you also like to add the Acme Safety Helmet? It's new and, as far as we know, it works.",
    ],
  },
]
