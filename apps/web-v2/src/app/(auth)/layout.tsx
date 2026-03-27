export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Brand panel */}
      <div className="hidden md:flex md:w-1/2 bg-gray-900 text-white flex-col justify-between p-10 xl:p-16">
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="w-5 h-5 text-white"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14l3 3 3-3m-3 3V14"
                />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight">Matex</span>
          </div>

          {/* Tagline */}
          <h1 className="text-3xl xl:text-4xl font-bold leading-snug mb-4">
            Canada&apos;s B2B Recycled&nbsp;Materials Marketplace
          </h1>
          <p className="text-gray-400 text-base leading-relaxed mb-10">
            Buy and sell verified scrap metal, plastics, paper, and more — with
            real-time auctions, escrow protection, and full compliance built in.
          </p>

          {/* Feature bullets */}
          <ul className="space-y-4">
            {[
              {
                icon: "🔒",
                title: "Escrow-protected transactions",
                body: "Funds held securely until delivery is confirmed.",
              },
              {
                icon: "⚡",
                title: "Live auction engine",
                body: "Sub-200ms bid processing with auto-extend fairness.",
              },
              {
                icon: "🇨🇦",
                title: "Canadian compliance",
                body: "GST/HST, FINTRAC, PIPEDA, and TDG all handled for you.",
              },
              {
                icon: "🤝",
                title: "KYC & credit facilities",
                body: "Verified buyers and sellers, with flexible net-30/60 terms.",
              },
            ].map(({ icon, title, body }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="text-xl leading-none mt-0.5">{icon}</span>
                <div>
                  <p className="font-semibold text-white text-sm">{title}</p>
                  <p className="text-gray-400 text-sm">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-gray-600 text-xs mt-12">
          © {new Date().getFullYear()} Matex Technologies Inc. All rights
          reserved.
        </p>
      </div>

      {/* Auth form panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-gray-50">
        <div className="w-full max-w-md">
          {/* Mobile-only logo */}
          <div className="flex items-center gap-2 mb-8 md:hidden">
            <div className="w-8 h-8 rounded-md bg-brand-600 flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="w-4 h-4 text-white"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14l3 3 3-3m-3 3V14"
                />
              </svg>
            </div>
            <span className="text-lg font-bold text-gray-900">Matex</span>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
