"use client";

import { useState, useEffect, useCallback } from "react";
import LoginScreen from "@/components/LoginScreen";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import SettingsPanel from "@/components/SettingsPanel";
import VacancyPanel from "@/components/VacancyPanel";
import WaiverPanel from "@/components/WaiverPanel";
import PopupFollowupsPanel from "@/components/PopupFollowupsPanel";
import EventPopupSalesmateSmsPanel from "@/components/EventPopupSalesmateSmsPanel";
import SyncsPanel from "@/components/SyncsPanel";
import OneOffPromotionsPanel from "@/components/OneOffPromotionsPanel";
import ActivityLog from "@/components/ActivityLog";

export default function Dashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [config, setConfig] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);
  const [lastRun, setLastRun] = useState(null);
  const [lastRunStatus, setLastRunStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("settings");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Check auth on mount
  useEffect(() => {
    if (sessionStorage.getItem("zc_admin_auth") === "true") {
      setAuthenticated(true);
    }
  }, []);

  // Fetch config + paginated logs (use for initial load and Refresh)
  const fetchData = useCallback(async (pageNum = 1) => {
    try {
      const [configRes, logsRes] = await Promise.all([
        fetch("/api/config"),
        fetch(`/api/logs?page=${pageNum}&limit=50`),
      ]);
      const configData = await configRes.json();
      const logsData = await logsRes.json();

      // Only set config if it's valid (avoid crash when API returns error)
      if (!configData?.error) setConfig(configData);

      setLogs(logsData.logs || []);
      setLogsPage(logsData.page || 1);
      setLogsTotalPages(logsData.totalPages || 1);
      setLogsTotal(logsData.total || 0);

      if (logsData.latestRun) {
        setLastRun(logsData.latestRun.timestamp);
        setLastRunStatus(logsData.latestRun.status);
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch only logs (for pagination) — does not refetch config
  const fetchLogsPage = useCallback(async (pageNum) => {
    try {
      const logsRes = await fetch(`/api/logs?page=${pageNum}&limit=50`);
      const logsData = await logsRes.json();
      setLogs(logsData.logs || []);
      setLogsPage(logsData.page || 1);
      setLogsTotalPages(logsData.totalPages || 1);
      setLogsTotal(logsData.total || 0);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    }
  }, []);

  useEffect(() => {
    if (authenticated) fetchData();
  }, [authenticated, fetchData]);

  // Save config
  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Save failed");
    } catch (err) {
      console.error("Failed to save config:", err);
      alert("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  // ─── Auth gate ────────────────────────────────────────────────────────────

  if (!authenticated) {
    return <LoginScreen onAuthenticated={() => setAuthenticated(true)} />;
  }

  // ─── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <p className="text-forest/60 text-sm">Loading...</p>
      </div>
    );
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen bg-cream">
      {/* Sidebar */}
      <Sidebar
        activeCategory={activeCategory}
        onSelect={setActiveCategory}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-h-screen">
        <Header />

        {/* Status Bar */}
        <div className="bg-sand/50 border-b border-sand px-8 py-3 flex items-center justify-between text-sm">
          <span className="text-forest/70">
            Last cron run:{" "}
            {lastRun ? new Date(lastRun).toLocaleString() : "Never"}
          </span>
          {lastRunStatus && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium text-white ${
                lastRunStatus === "SUCCESS" ? "bg-grove" : "bg-red-500"
              }`}
            >
              {lastRunStatus}
            </span>
          )}
        </div>

        {/* Content */}
        <main className="flex-1 max-w-4xl mx-auto px-6 py-10 space-y-8 w-full">
          {config && (
            <>
              {activeCategory === "settings" && (
                <SettingsPanel
                  config={config.sendgrid}
                  onChange={(updated) =>
                    setConfig((prev) => ({ ...prev, sendgrid: updated }))
                  }
                />
              )}
              {activeCategory === "vacancy" && (
                <VacancyPanel
                  config={config.vacancyEmails}
                  onChange={(updated) =>
                    setConfig((prev) => ({
                      ...prev,
                      vacancyEmails: updated,
                    }))
                  }
                />
              )}

              {activeCategory === "promotions" && (
                <OneOffPromotionsPanel onComplete={fetchData} />
              )}

              {activeCategory === "waiver" && (
                <WaiverPanel
                  config={config.waiverReminders}
                  onChange={(updated) =>
                    setConfig((prev) => ({
                      ...prev,
                      waiverReminders: updated,
                    }))
                  }
                />
              )}

              {activeCategory === "popup" && (
                <PopupFollowupsPanel
                  config={config.popupFollowups}
                  sendgridConfig={config.sendgrid}
                  onChange={(updated) =>
                    setConfig((prev) => ({
                      ...prev,
                      popupFollowups: updated,
                    }))
                  }
                />
              )}

              {activeCategory === "event-popup" && (
                <EventPopupSalesmateSmsPanel
                  config={config.eventPopupSalesmateSms}
                  onChange={(updated) =>
                    setConfig((prev) => ({
                      ...prev,
                      eventPopupSalesmateSms: updated,
                    }))
                  }
                />
              )}

              {activeCategory === "syncs" && (
                <SyncsPanel
                  jotformConfig={config.jotformClientSync}
                  lodgifyConfig={config.lodgifyClientSync}
                  salesmateConfig={config.salesmateFormSync}
                  onChange={(updated) =>
                    setConfig((prev) => ({
                      ...prev,
                      jotformClientSync: updated.jotformClientSync,
                      lodgifyClientSync: updated.lodgifyClientSync,
                      salesmateFormSync: updated.salesmateFormSync,
                    }))
                  }
                />
              )}

              {/* Save Button */}
              {activeCategory !== "promotions" && (
                <div className="flex justify-end">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-grove hover:bg-forest text-white font-sans font-medium px-6 py-3 rounded-full tracking-wide transition-colors duration-200 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Activity Log — always visible */}
          <ActivityLog
            logs={logs}
            page={logsPage}
            totalPages={logsTotalPages}
            total={logsTotal}
            onPageChange={fetchLogsPage}
            onRefresh={fetchData}
          />
        </main>
      </div>
    </div>
  );
}
