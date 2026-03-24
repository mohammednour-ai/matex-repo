# MATEX

**MCP-First B2B Marketplace for Scrap Materials & Surplus Inventory**

Matex is a next-generation B2B marketplace built entirely on the Model Context Protocol (MCP) architecture. Every business capability is exposed as a set of MCP tools, resources, and events that any AI agent or client can consume directly.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENTS                               │
│  Web (Next.js)  │  Mobile (React Native)  │  AI Agents  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                   MCP GATEWAY                            │
│         Auth │ Rate Limit │ Route │ Log                  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│              LOCAL MCP SERVERS (23)                       │
│  auth │ profile │ kyc │ listing │ search │ bidding       │
│  auction │ inspection │ booking │ escrow │ payments      │
│  contracts │ dispute │ logistics │ tax │ notifications   │
│  messaging │ esign │ pricing │ analytics │ admin         │
│  storage │ log                                           │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│            EXTERNAL MCP BRIDGES (13)                     │
│  stripe │ docusign │ onfido │ sendgrid │ twilio │ fcm   │
│  carriers │ lme │ fastmarkets │ maps │ accounting       │
│  equifax │ adobe-sign                                    │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                  INFRASTRUCTURE                          │
│  PostgreSQL (Supabase) │ Redis (Upstash) │ S3 Storage   │
│  Event Bus (Redis Streams) │ Log Store                   │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router) |
| Mobile | React Native + Expo |
| MCP Servers | Node.js + TypeScript + MCP SDK |
| Database | PostgreSQL 15 + PostGIS (Supabase) |
| Cache/Events | Redis (Upstash) |
| Payments | Stripe Connect |
| Auth | Supabase Auth + JWT |
| Hosting | Vercel (web) + Railway (MCP servers) |

## Project Structure

```
matex/
├── apps/
│   ├── web/                    # Next.js 14 web application
│   └── mcp-gateway/            # MCP Gateway (auth, routing, rate limiting)
├── packages/
│   ├── mcp-servers/            # Local MCP servers (business logic)
│   │   ├── auth-mcp/
│   │   ├── listing-mcp/
│   │   ├── search-mcp/
│   │   ├── messaging-mcp/
│   │   ├── payments-mcp/
│   │   ├── log-mcp/
│   │   └── storage-mcp/
│   ├── bridges/                # External API bridges
│   │   ├── stripe-bridge/
│   │   ├── sendgrid-bridge/
│   │   ├── twilio-bridge/
│   │   └── maps-bridge/
│   └── shared/                 # Shared types, utilities, templates
│       ├── types/
│       ├── utils/
│       └── mcp-template/
├── infrastructure/
│   ├── supabase/
│   │   ├── migrations/         # SQL migration files
│   │   └── seed/               # Seed data
│   └── docker/                 # Docker configurations
├── docs/                       # Project documentation
│   ├── system-analysis/        # System Analysis Document (v1, v2)
│   ├── architecture/           # MCP Architecture Document
│   ├── milestones/             # Product Milestones & Roadmap
│   └── database/               # Database schema documentation
└── .github/
    └── workflows/              # CI/CD pipelines
```

## Documentation

| Document | Description |
|----------|-------------|
| [System Analysis v2](docs/system-analysis/) | 25-section comprehensive system analysis |
| [MCP Architecture](docs/architecture/) | 12-section MCP-first architecture specification |
| [Milestones & Roadmap](docs/milestones/) | 12-month phased roadmap with go/no-go gates |
| [Database Schema](docs/database/) | Complete PostgreSQL schema (22 schemas, 64 tables) |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 8+
- Supabase CLI
- Docker (optional, for local development)

### Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/matex.git
cd matex

# Install dependencies
pnpm install

# Setup environment variables
cp .env.example .env.local

# Run database migrations
pnpm db:migrate

# Start development
pnpm dev
```

## Roadmap

- **Phase 0** (Mar 2026): Foundation — Infrastructure, CI/CD, MCP Gateway
- **Phase 1** (Apr-May 2026): Core MVP — List, Search, Message, Buy
- **Phase 2** (Jun-Jul 2026): Auctions & Trust — KYC, Escrow, Bidding, Inspection
- **Phase 3** (Aug-Sep 2026): Operations — Logistics, Contracts, Tax, eSign
- **Phase 4** (Oct-Dec 2026): Growth — Disputes, Pricing, Analytics, Credit
- **Phase 5** (Jan-Mar 2027): Scale — Mobile, Cross-Border, Optimization

## License

Proprietary. All rights reserved.
