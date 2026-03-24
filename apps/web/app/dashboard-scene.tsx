import {
  aiSuggestions,
  inventoryCards,
  orderSummary,
  platformMetrics,
  shipmentQuotes,
  threadMessages,
} from "./mock-data";

const moduleSignals = [
  "listing.create_listing",
  "search.search_materials",
  "messaging.create_thread",
  "payments.process_payment",
  "escrow.create_escrow",
  "logistics.get_quotes",
];

export function DashboardScene({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="dashboard-scene">
      <div className="scene-header">
        <div>
          <p className="eyebrow">Integrated product canvas</p>
          <h1>{title}</h1>
          <p className="lede">{subtitle}</p>
        </div>
        <div className="scene-pills">
          <span className="status-pill">Cloud AI copilot</span>
          <span className="status-pill">MCP orchestration live</span>
          <span className="status-pill muted">Static prototype</span>
        </div>
      </div>

      <div className="hero-metrics">
        {platformMetrics.map((metric) => (
          <article className="hero-metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </article>
        ))}
      </div>

      <div className="visual-grid">
        <section className="surface-card listing-surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Listing editor</p>
              <h2>High-grade aluminum ingot lot #112</h2>
            </div>
            <span className="surface-state">Draft synced</span>
          </div>

          <div className="field-grid">
            <div className="field-block">
              <span>Category</span>
              <strong>Non-ferrous metals</strong>
            </div>
            <div className="field-block">
              <span>Quantity</span>
              <strong>50 mt</strong>
            </div>
            <div className="field-block">
              <span>Price type</span>
              <strong>Auction + Buy now</strong>
            </div>
            <div className="field-block">
              <span>Reserve price</span>
              <strong>$110,000</strong>
            </div>
            <div className="field-block">
              <span>Buy now</span>
              <strong>$124,500</strong>
            </div>
            <div className="field-block">
              <span>Quality grade</span>
              <strong>99.7% purity</strong>
            </div>
            <div className="field-block">
              <span>Contamination</span>
              <strong>0.2%</strong>
            </div>
            <div className="field-block">
              <span>Inspection</span>
              <strong>Required</strong>
            </div>
          </div>

          <div className="sync-bar">
            <span>AI assisted field completion</span>
            <div>
              <i style={{ width: "78%" }} />
            </div>
          </div>
        </section>

        <section className="surface-card inventory-surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Live marketplace cards</p>
              <h2>Material inventory</h2>
            </div>
            <span className="surface-state">4 active signals</span>
          </div>

          <div className="mini-card-grid">
            {inventoryCards.map((item) => (
              <article className="mini-market-card" key={item.title}>
                <span>{item.subtitle}</span>
                <strong>{item.title}</strong>
                <p>{item.meta}</p>
                <em>{item.amount}</em>
              </article>
            ))}
          </div>
        </section>

        <section className="surface-card analytics-surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Marketplace analytics</p>
              <h2>Price movement + conversion</h2>
            </div>
            <span className="surface-state">Ontario / Quebec</span>
          </div>

          <div className="chart-surface">
            <div className="chart-bars">
              {[34, 52, 44, 68, 61, 74, 70].map((height, index) => (
                <span key={height} style={{ height: `${height}%`, animationDelay: `${index * 80}ms` }} />
              ))}
            </div>
            <div className="chart-line">
              <i />
            </div>
          </div>

          <div className="analytics-footer">
            <div>
              <span>Bid interest</span>
              <strong>+18%</strong>
            </div>
            <div>
              <span>Avg close speed</span>
              <strong>2.4 days</strong>
            </div>
            <div>
              <span>Suggested premium</span>
              <strong>$125 / mt</strong>
            </div>
          </div>
        </section>

        <section className="surface-card orchestration-surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Order orchestration</p>
              <h2>{orderSummary.lot}</h2>
            </div>
            <span className="surface-state">Escrow ready</span>
          </div>

          <div className="orchestration-flow">
            {["List", "Find", "Message", "Buy", "Ship"].map((step, index) => (
              <div className="flow-step" key={step}>
                <b>{index + 1}</b>
                <span>{step}</span>
              </div>
            ))}
          </div>

          <div className="detail-grid">
            <div>
              <span>Held funds</span>
              <strong>{orderSummary.escrowHeld}</strong>
            </div>
            <div>
              <span>Invoice</span>
              <strong>{orderSummary.invoiceNumber}</strong>
            </div>
            <div>
              <span>Payment</span>
              <strong>Card ending 4242</strong>
            </div>
            <div>
              <span>Release</span>
              <strong>Inspection + POD</strong>
            </div>
          </div>
        </section>

        <section className="surface-card logistics-surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Logistics hub</p>
              <h2>Carrier comparison</h2>
            </div>
            <span className="surface-state">Live quote matrix</span>
          </div>

          <div className="quote-stack">
            {shipmentQuotes.map((quote) => (
              <article className="quote-chip" key={quote.carrier}>
                <div>
                  <strong>{quote.carrier}</strong>
                  <span>{quote.score}</span>
                </div>
                <p>{quote.eta}</p>
                <em>{quote.price}</em>
              </article>
            ))}
          </div>
        </section>

        <section className="surface-card mcp-surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">MCP cloud connectivity</p>
              <h2>Tool flow and module graph</h2>
            </div>
            <span className="surface-state">6 modules active</span>
          </div>

          <div className="node-cloud">
            <div className="node-core">MCP</div>
            <span className="node a" />
            <span className="node b" />
            <span className="node c" />
            <span className="node d" />
            <span className="node e" />
          </div>

          <div className="signal-list">
            {moduleSignals.map((signal) => (
              <div key={signal}>
                <i />
                <span>{signal}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className="surface-card chat-surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">AI copilot</p>
              <h2>Chat + actions</h2>
            </div>
            <span className="surface-state">Context linked</span>
          </div>

          <div className="chat-thread">
            {threadMessages.map((message) => (
              <article className="chat-bubble" key={`${message.from}-${message.time}`}>
                <div className="chat-meta">
                  <strong>{message.from}</strong>
                  <span>{message.time}</span>
                </div>
                <p>{message.body}</p>
              </article>
            ))}
            <article className="chat-bubble ai-highlight">
              <div className="chat-meta">
                <strong>AI copilot</strong>
                <span>09:19</span>
              </div>
              <p>
                I can prefill escrow, rank carrier quotes, and generate the next seller reply from
                the current negotiation state.
              </p>
            </article>
          </div>

          <div className="quick-actions">
            {aiSuggestions.map((item) => (
              <button key={item} type="button">
                {item}
              </button>
            ))}
          </div>

          <div className="chat-input">
            <span>Ask MATEX AI to update listing, escrow, shipping, or contracts...</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
