"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginScreen({ onAuthenticated }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        if (onAuthenticated) onAuthenticated();
        router.refresh();
      } else {
        setError("Incorrect password.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center">
        <svg
          width="48"
          height="34"
          viewBox="0 0 40 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="mb-3"
        >
          <path
            d="M2 18C4 14 8 8 14 6C16 5.5 18 6 19 8C20 6 22 5.5 24 6C30 8 34 14 36 18"
            stroke="#1C3A1F"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M8 20C10 16 13 12 17 11"
            stroke="#1C3A1F"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M30 20C28 16 25 12 21 11"
            stroke="#1C3A1F"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
        <div>
          <span className="font-serif italic text-forest text-3xl">
            Zenful
          </span>
          <span className="font-serif italic text-forest text-3xl tracking-widest">
            COVE
          </span>
        </div>
        <p className="text-forest/50 text-xs tracking-[0.3em] uppercase mt-1">
          Texas Glamping Retreat
        </p>
      </div>

      {/* Login Card */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-sm border border-sand p-8 w-full max-w-sm"
      >
        <h2 className="font-serif text-xl text-forest mb-1 text-center">
          Admin Dashboard
        </h2>
        <p className="text-forest/50 text-sm text-center mb-6">
          Enter password to continue
        </p>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full border border-sand rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-grove/30 mb-4"
          autoFocus
        />

        {error && (
          <p className="text-red-600 text-sm mb-4 text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !password}
          className="w-full bg-grove hover:bg-forest text-white font-sans font-medium px-6 py-3 rounded-full tracking-wide transition-colors duration-200 disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
