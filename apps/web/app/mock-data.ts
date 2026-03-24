export const platformMetrics = [
  { label: "Active listings", value: "1,284", detail: "+12.4% this week" },
  { label: "Escrow held", value: "$2.48M", detail: "42 open releases" },
  { label: "Live MCP tools", value: "23", detail: "All domains online" },
  { label: "AI guided actions", value: "318", detail: "Across web + chat" },
];

export const aiSuggestions = [
  "Pre-fill listing quality details from previous aluminum lots.",
  "Recommend a reserve price based on regional MPI and recent bids.",
  "Surface the best carrier quote after buyer confirms pickup window.",
  "Generate a contract summary and escrow release checklist.",
];

export const workflowSteps = [
  {
    title: "List",
    detail: "Seller drafts a listing with category, quantity, pricing, permits, and inspection settings.",
  },
  {
    title: "Find",
    detail: "Buyer searches by material, region, radius, and price signals while AI narrows the best matches.",
  },
  {
    title: "Message",
    detail: "Threaded negotiation, AI summaries, and tool calls stay linked to the listing and order context.",
  },
  {
    title: "Buy",
    detail: "Checkout hands off to escrow, shipping, booking, inspection, and invoice generation.",
  },
];

export const listingDraft = {
  title: "High-grade aluminum ingot lot #112",
  category: "Non-ferrous metals",
  quantity: "50",
  unit: "mt",
  priceType: "Auction with buy-now",
  askingPrice: "$2,400 / mt",
  reservePrice: "$110,000",
  buyNowPrice: "$124,500",
  qualityGrade: "ISRI Tense / 99.7% purity",
  contamination: "0.2%",
  moisture: "0.1%",
  pickupAddress: "Hamilton, ON, Canada",
  inspectionRequired: "Yes",
  environmentalPermits: "Provincial transport permit on file",
};

export const inventoryCards = [
  {
    title: "Aluminum ingots",
    subtitle: "Lot 350",
    amount: "$75,000",
    meta: "26 mt • ON",
  },
  {
    title: "Copper wire",
    subtitle: "Lot 059",
    amount: "$20,000",
    meta: "12 mt • QC",
  },
  {
    title: "Crushed steel bales",
    subtitle: "Lot 250",
    amount: "$32,000",
    meta: "40 mt • AB",
  },
  {
    title: "Battery scrap",
    subtitle: "Class 8",
    amount: "$44,900",
    meta: "18 mt • MB",
  },
];

export const searchFilters = [
  { label: "Material", value: "Copper wire" },
  { label: "Region", value: "Ontario + Quebec" },
  { label: "Radius", value: "250 km" },
  { label: "Price range", value: "$15,000 - $30,000" },
  { label: "Inspection", value: "Required only" },
  { label: "Alert", value: "Daily digest" },
];

export const searchResults = [
  {
    title: "Bare bright copper wire",
    price: "$22,495",
    detail: "Toronto, ON • 18 mt • Featured",
    status: "Open for negotiation",
  },
  {
    title: "Millberry copper coil lot",
    price: "$24,200",
    detail: "Montreal, QC • 14 mt • Auction",
    status: "2 active bids",
  },
  {
    title: "Insulated copper harness scrap",
    price: "$18,950",
    detail: "London, ON • 22 mt • Fixed",
    status: "Inspection requested",
  },
];

export const threadMessages = [
  {
    from: "Buyer",
    time: "09:15",
    body: "Can you confirm contamination stays under 0.5% and share pickup readiness?",
  },
  {
    from: "AI copilot",
    time: "09:16",
    body: "Historical lots from this seller average 0.3% contamination. Suggested reply drafted and attached to the thread.",
  },
  {
    from: "Seller",
    time: "09:18",
    body: "Ready for pickup on Thu. We can hold at $22,495 if escrow is funded today.",
  },
];

export const orderSummary = {
  lot: "Lot 9415 Copper Wire",
  escrowHeld: "$22,495",
  releaseConditions: "Inspection approved, delivery confirmed, dispute resolved",
  paymentMethod: "Stripe card ending 4242",
  invoiceNumber: "MTX-2026-000042",
};

export const escrowTimeline = [
  { title: "Escrow created", detail: "Buyer and seller linked to order #MTX-9415." },
  { title: "Funds held", detail: "$22,495 captured and held in CAD." },
  { title: "Inspection pending", detail: "Pickup inspection scheduled for Tue 09:30." },
  { title: "Release ready", detail: "Auto-release after POD + buyer sign-off." },
];

export const shipmentQuotes = [
  { carrier: "Day & Ross", price: "$1,190", eta: "2 days", score: "Best price" },
  { carrier: "Manitoulin", price: "$1,240", eta: "2 days", score: "Top reliability" },
  { carrier: "Purolator Freight", price: "$1,305", eta: "1 day", score: "Fastest" },
];

export const bookings = [
  { title: "Buyer site visit", time: "Tue 09:30", detail: "Hamilton, ON" },
  { title: "Carrier pickup", time: "Thu 14:00", detail: "Dock 3 confirmed" },
  { title: "Delivery inspection", time: "Fri 11:00", detail: "Toronto warehouse" },
];

export const weightChain = [
  { point: "W1 seller", value: "18,420 kg", detail: "Seller scale ticket uploaded" },
  { point: "W2 carrier", value: "18,395 kg", detail: "Carrier certified scale" },
  { point: "W3 buyer", value: "18,380 kg", detail: "Buyer receiving scale" },
  { point: "W4 third party", value: "Pending", detail: "Only used if dispute opens" },
];

export const contractSummary = {
  type: "Volume contract",
  pricing: "LME copper + $125 premium",
  quantity: "240 mt annual volume",
  nextOrder: "Apr 02, 2026",
  esign: "Completed",
};

export const taxSummary = [
  { label: "Subtotal", value: "$22,495.00" },
  { label: "Commission", value: "$787.33" },
  { label: "HST", value: "$102.35" },
  { label: "Total", value: "$23,384.68" },
];

export const dashboardCards = [
  { title: "My listings", value: "48", detail: "12 pending review" },
  { title: "Open messages", value: "19", detail: "4 require response" },
  { title: "Orders in transit", value: "11", detail: "3 need booking" },
  { title: "KYC status", value: "Level 2", detail: "Level 3 review due in 45 days" },
];

export const notifications = [
  "Buyer accepted reserve adjustment for copper wire lot.",
  "MCP gateway forwarded `escrow.create_escrow` successfully.",
  "Carrier quote comparison is ready for order #MTX-9415.",
  "Environmental permit expiry alert: 60 days remaining.",
];

export const kycChecklist = [
  "Account created and MFA enabled",
  "Corporate registration documents uploaded",
  "Beneficial ownership review in progress",
  "PEP / sanctions screening clear",
];
