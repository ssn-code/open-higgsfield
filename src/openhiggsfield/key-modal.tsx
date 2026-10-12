"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  clearPlatformCredentials,
  getCredentialsInfo,
  savePlatformCredentials,
} from "@/generation/actions";

import { CloseIcon } from "./icons";

export function KeyModal({
  configured,
  onClose,
  onSaved,
  onCleared,
}: {
  configured: boolean;
  onClose: () => void;
  onSaved: () => void;
  onCleared: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentProvider, setCurrentProvider] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
    panelRef.current?.focus();
    void getCredentialsInfo().then((info) => {
      if (info.provider) setCurrentProvider(info.provider);
      if (info.baseUrl) setBaseUrl(info.baseUrl);
    });
  }, []);

  const isNv = apiKey.trim().startsWith("nvapi-") || (!apiKey.trim().includes(":") && apiKey.trim().length > 0);
  const detectedProvider = apiKey.trim()
    ? isNv
      ? "NVIDIA NIM"
      : "Higgsfield"
    : currentProvider === "nvidia"
    ? "NVIDIA NIM"
    : currentProvider === "higgsfield"
    ? "Higgsfield"
    : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const provider = isNv ? "nvidia" : "higgsfield";
      await savePlatformCredentials({
        apiKey,
        provider,
        baseUrl: baseUrl.trim() || undefined,
      });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the key");
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    setBusy(true);
    setError(null);
    try {
      await clearPlatformCredentials();
      setApiKey("");
      setBaseUrl("");
      setCurrentProvider(null);
      onCleared();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove the key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="ohf-keys-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div ref={panelRef} tabIndex={-1} className="ohf-dialog-panel ohf-keys-panel">
        <div className="ohf-keys-head">
          <div>
            <div id="ohf-keys-title" className="ohf-keys-title">
              API credentials
            </div>
            <p className="ohf-keys-copy">
              {configured
                ? `An API key is active (${detectedProvider ?? "Platform"}). Enter a new key to replace it.`
                : "Enter your NVIDIA API key (nvapi-...) from build.nvidia.com or your Higgsfield platform key (id:secret)."}
            </p>
          </div>
          <button type="button" className="ohf-icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon size={13} />
          </button>
        </div>

        <form className="ohf-keys-form" onSubmit={(event) => void onSubmit(event)}>
          <label className="ohf-field">
            <div className="ohf-field-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>API key</span>
              {detectedProvider && (
                <span
                  style={{
                    fontSize: "11px",
                    padding: "1px 7px",
                    borderRadius: "4px",
                    background: detectedProvider === "NVIDIA NIM" ? "#76b900" : "var(--accent)",
                    color: "#000",
                    fontWeight: 600,
                  }}
                >
                  {detectedProvider}
                </span>
              )}
            </div>
            <input
              className="ohf-input ohf-input--mono"
              name="api_key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="nvapi-... or id:secret"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>

          <div style={{ marginTop: "2px" }}>
            <button
              type="button"
              className="ohf-btn-quiet"
              style={{ fontSize: "11.5px", padding: 0 }}
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? "▾ Hide endpoint settings" : "▸ Custom NIM endpoint (optional)"}
            </button>
          </div>

          {showAdvanced && (
            <label className="ohf-field" style={{ marginTop: "4px" }}>
              <div className="ohf-field-label">NIM Base URL (optional for self-hosted)</div>
              <input
                className="ohf-input ohf-input--mono"
                name="base_url"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://integrate.api.nvidia.com/v1"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
              />
            </label>
          )}

          {error && (
            <div className="ohf-alert" role="alert">
              <span className="ohf-alert-text">{error}</span>
            </div>
          )}

          <div className="ohf-keys-actions">
            {configured && (
              <button type="button" className="ohf-btn-quiet" disabled={busy} onClick={() => void onClear()}>
                Remove key
              </button>
            )}
            <button type="submit" className="ohf-keys-save" disabled={busy || !apiKey.trim()}>
              {busy ? "Saving…" : configured ? "Replace key" : "Save key"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}