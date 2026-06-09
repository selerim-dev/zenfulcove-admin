"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import SettingsPanel from "@/components/SettingsPanel";
import VacancyPanel from "@/components/VacancyPanel";
import WaiverPanel from "@/components/WaiverPanel";
import PopupFollowupsPanel from "@/components/PopupFollowupsPanel";
import EventPopupSalesmateSmsPanel from "@/components/EventPopupSalesmateSmsPanel";
import SyncsPanel from "@/components/SyncsPanel";
import OneOffPromotionsPanel from "@/components/OneOffPromotionsPanel";
import MessagesPanel from "@/components/MessagesPanel";
import ActivityLog from "@/components/ActivityLog";
import FloatingSaveBar from "@/components/FloatingSaveBar";

const CATEGORY_TITLES = {
  settings: "Global Settings",
  messages: "Guest Messages",
  promotions: "One-Off Promotions",
  vacancy: "Vacancy Promo Emails",
  waiver: "Waiver Reminders",
  popup: "Popup Follow Ups",
  "event-popup": "Event Popup SMS",
  syncs: "External Syncs",
};

export default function Dashboard() {
  const [config, setConfig] = useState(null);
  const [savedConfig, setSavedConfig] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);
  const [lastRun, setLastRun] = useState(null);
  const [lastRunStatus, setLastRunStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedRecently, setSavedRecently] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("settings");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [messagesInitial, setMessagesInitial] = useState(null);

  // Honor deep links from notification emails: ?tab=messages&number=...&contact=...
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab) setActiveCategory(tab);
    const number = params.get("number");
    const contact = params.get("contact");
    if (tab === "messages" && (number || contact)) {
      setMessagesInitial({
        twilioNumber: number || "",
        contactPhone: contact || "",
      });
    }
  }, []);

  // Fetch config + paginated logs (use for initial load and Refresh)
  const fetchData = useCallback(async (pageNum = 1) => {
    try {
      const [configRes, logsRes] = await Promise.all([
        fetch("/api/config"),
        fetch(`/api/logs?page=${pageNum}&limit=10`),
      ]);
      const configData = await configRes.json();
      const logsData = await logsRes.json();

      // Only set config if it's valid (avoid crash when API returns error)
      if (!configData?.error) {
        setConfig(configData);
        setSavedConfig(configData);
      }

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
      const logsRes = await fetch(`/api/logs?page=${pageNum}&limit=10`);
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
    fetchData();
  }, [fetchData]);

  const hasUnsavedConfigChanges = useMemo(() => {
    if (!config || !savedConfig) return false;
    return JSON.stringify(config) !== JSON.stringify(savedConfig);
  }, [config, savedConfig]);

  useEffect(() => {
    if (!savedRecently) return;
    const timeout = window.setTimeout(() => setSavedRecently(false), 2400);
    return () => window.clearTimeout(timeout);
  }, [savedRecently]);

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
      setSavedConfig(config);
      setSavedRecently(true);
    } catch (err) {
      console.error("Failed to save config:", err);
      alert("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  // ─── Auth gate ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <p className="text-forest/60 text-sm">Loading...</p>
      </div>
    );
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)] text-[var(--color-ink)]">
      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      {/* Sidebar */}
      <Sidebar
        activeCategory={activeCategory}
        onSelect={setActiveCategory}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-h-0">
        <Header
          activeTitle={CATEGORY_TITLES[activeCategory] || "Admin Dashboard"}
          lastRun={lastRun}
          lastRunStatus={lastRunStatus}
          onOpenMenu={() => setMobileSidebarOpen(true)}
        />

        {/* Content */}
        {activeCategory === "messages" ? (
          <main className="flex-1 min-h-0 flex flex-col w-full">
            <MessagesPanel initialSelection={messagesInitial} />
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto">
            <div
              className={`mx-auto w-full space-y-6 px-4 py-6 md:px-8 md:py-8 ${
                activeCategory === "waiver" ? "max-w-none" : "max-w-5xl"
              }`}
            >
          {config && activeCategory !== "messages" && (
            <>
              {activeCategory === "settings" && (
                <SettingsPanel
                  config={config.sendgrid}
                  onChange={(updated) =>
                    setConfig((prev) => ({ ...prev, sendgrid: updated }))
                  }
                  messageNotifications={config.messageNotifications}
                  onMessageNotificationsChange={(updated) =>
                    setConfig((prev) => ({
                      ...prev,
                      messageNotifications: updated,
                    }))
                  }
                  customerPortal={config.customerPortal}
                  onCustomerPortalChange={(updated) =>
                    setConfig((prev) => ({
                      ...prev,
                      customerPortal: updated,
                    }))
                  }
                  accessCodeRelease={config.accessCodeRelease}
                  onAccessCodeReleaseChange={(updated) =>
                    setConfig((prev) => ({
                      ...prev,
                      accessCodeRelease: updated,
                    }))
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
                  accessCodeRelease={config.accessCodeRelease}
                  onAccessCodeReleaseChange={(updated) =>
                    setConfig((prev) => ({
                      ...prev,
                      accessCodeRelease: updated,
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
                  localFormConfig={config.localFormClientSync}
                  jotformImportConfig={config.jotformLocalFormImport}
                  lodgifyConfig={config.lodgifyClientSync}
                  salesmateConfig={config.salesmateFormSync}
                  onChange={(updated) =>
                    setConfig((prev) => ({
                      ...prev,
                      jotformClientSync: updated.jotformClientSync,
                      localFormClientSync: updated.localFormClientSync,
                      jotformLocalFormImport: updated.jotformLocalFormImport,
                      lodgifyClientSync: updated.lodgifyClientSync,
                      salesmateFormSync: updated.salesmateFormSync,
                    }))
                  }
                />
              )}

            </>
          )}

            <ActivityLog
              logs={logs}
              page={logsPage}
              totalPages={logsTotalPages}
              total={logsTotal}
              onPageChange={fetchLogsPage}
              onRefresh={fetchData}
            />
            </div>
          </main>
        )}
      </div>
      <FloatingSaveBar
        visible={Boolean(config) && hasUnsavedConfigChanges}
        saved={savedRecently}
        saving={saving}
        onSave={handleSave}
        saveLabel="Save changes"
        savingLabel="Saving..."
        message="Unsaved settings"
      />
    </div>
  );
}
