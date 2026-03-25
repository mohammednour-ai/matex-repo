"use client";

import { useState } from "react";

export function ErrorToast({ message, debug, onDismiss }: { message: string; debug?: string; onDismiss?: () => void }) {
  const [showDebug, setShowDebug] = useState(false);

  return (
    <div className="error-toast" role="alert">
      <div className="error-toast-header">
        <span className="error-toast-icon">!</span>
        <p className="error-toast-message">{message}</p>
        {onDismiss && (
          <button className="error-toast-close" type="button" onClick={onDismiss} aria-label="Dismiss">x</button>
        )}
      </div>
      {debug && (
        <div className="error-toast-debug">
          <button type="button" className="error-toast-toggle" onClick={() => setShowDebug(!showDebug)}>
            {showDebug ? "Hide" : "Show"} debug details
          </button>
          {showDebug && <pre className="error-toast-pre">{debug}</pre>}
        </div>
      )}
    </div>
  );
}

export function SuccessToast({ message }: { message: string }) {
  return (
    <div className="success-toast" role="status">
      <span className="success-toast-icon">✓</span>
      <p>{message}</p>
    </div>
  );
}
