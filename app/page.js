"use client";
import { useApp } from "@/components/AppProvider";
import { Login, Pending, ConfigMissing } from "@/components/Gate";
import AppShell from "@/components/AppShell";

export default function Home() {
  const { status } = useApp();
  if (status === "config") return <ConfigMissing />;
  if (status === "signedOut") return <Login />;
  if (status === "owner" || status === "pending" || status === "off") return <Pending />;
  if (status === "ready") return <AppShell />;
  return <div className="gate"><p className="loading">Opening the cash book…</p></div>;
}
