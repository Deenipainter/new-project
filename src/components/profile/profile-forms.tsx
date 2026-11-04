"use client";
import React from 'react';

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";

export function ProfileForms({
  fullName,
  phone,
  email,
}: {
  fullName: string;
  phone: string;
  email: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(fullName);
  const [phoneNumber, setPhoneNumber] = useState(phone);
  const [emailAddress, setEmailAddress] = useState(email);
  const [emailPassword, setEmailPassword] = useState("");
  const emailChanged = emailAddress.trim().toLowerCase() !== email.trim().toLowerCase();
  const [profileState, setProfileState] = useState<{ busy: boolean; message: string | null; error: string | null }>({
    busy: false,
    message: null,
    error: null,
  });

  const [passwords, setPasswords] = useState({ currentPassword: "", password: "", confirmPassword: "" });
  const [passwordState, setPasswordState] = useState<{
    busy: boolean;
    message: string | null;
    error: string | null;
  }>({ busy: false, message: null, error: null });

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setProfileState({ busy: true, message: null, error: null });
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: name,
          phone: phoneNumber,
          email: emailAddress,
          currentPassword: emailPassword || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setProfileState({ busy: false, message: null, error: payload.error ?? "Could not save." });
        return;
      }
      setEmailPassword("");
      setProfileState({
        busy: false,
        message: emailChanged ? "Login email updated — use it next time you sign in." : "Profile updated.",
        error: null,
      });
      router.refresh();
    } catch {
      setProfileState({ busy: false, message: null, error: "Network problem. Please try again." });
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordState({ busy: true, message: null, error: null });
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passwords),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPasswordState({ busy: false, message: null, error: payload.error ?? "Could not change password." });
        return;
      }
      setPasswords({ currentPassword: "", password: "", confirmPassword: "" });
      setPasswordState({ busy: false, message: payload.message ?? "Password updated.", error: null });
    } catch {
      setPasswordState({ busy: false, message: null, error: "Network problem. Please try again." });
    }
  }

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <h2 className="text-[14px] font-semibold">Your details</h2>
        <p className="mt-0.5 text-[11.5px] text-ink-muted">
          Your name, phone number and login email are editable. Role, balance and IDs stay server-controlled.
        </p>
        <form onSubmit={saveProfile} className="mt-3 space-y-3">
          <div>
            <label htmlFor="fullName" className="field-label">
              Full name
            </label>
            <input
              id="fullName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="app-input"
            />
          </div>
          <div>
            <label htmlFor="phone" className="field-label">
              Phone number
            </label>
            <input
              id="phone"
              inputMode="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              className="app-input"
            />
          </div>
          <div>
            <label htmlFor="email" className="field-label">
              Login email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={emailAddress}
              onChange={(event) => setEmailAddress(event.target.value)}
              className="app-input"
            />
            <p className="field-hint">This is the address you sign in with and where account mail is sent.</p>
          </div>
          {emailChanged && (
            <div>
              <label htmlFor="emailPassword" className="field-label">
                Current password (required to change your email)
              </label>
              <input
                id="emailPassword"
                type="password"
                autoComplete="current-password"
                value={emailPassword}
                onChange={(event) => setEmailPassword(event.target.value)}
                className="app-input"
                required
              />
            </div>
          )}
          {profileState.error && (
            <p role="alert" className="rounded-lg border border-[#F6D3D0] bg-[#FDEDEC] px-3 py-2 text-[11.5px] font-medium text-[#A32B22]">
              {profileState.error}
            </p>
          )}
          {profileState.message && (
            <p className="rounded-lg border border-[#C9EBD9] bg-[#EAF7F0] px-3 py-2 text-[11.5px] font-medium text-[#0B7A45]">
              {profileState.message}
            </p>
          )}
          <button type="submit" disabled={profileState.busy} className="btn-brand" aria-busy={profileState.busy}>
            {profileState.busy && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </button>
        </form>
      </section>

      <section className="panel p-4">
        <h2 className="text-[14px] font-semibold">Change password</h2>
        <p className="mt-0.5 text-[11.5px] text-ink-muted">
          Enter your current password to set a new one. Passwords are hashed with bcrypt — never stored in
          plain text.
        </p>
        <form onSubmit={changePassword} className="mt-3 space-y-3">
          <div>
            <label htmlFor="currentPassword" className="field-label">
              Current password
            </label>
            <input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={passwords.currentPassword}
              onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })}
              className="app-input"
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="newPassword" className="field-label">
                New password
              </label>
              <input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={passwords.password}
                onChange={(event) => setPasswords({ ...passwords, password: event.target.value })}
                className="app-input"
                required
              />
            </div>
            <div>
              <label htmlFor="confirmNew" className="field-label">
                Confirm new password
              </label>
              <input
                id="confirmNew"
                type="password"
                autoComplete="new-password"
                value={passwords.confirmPassword}
                onChange={(event) => setPasswords({ ...passwords, confirmPassword: event.target.value })}
                className="app-input"
                required
              />
            </div>
          </div>
          {passwordState.error && (
            <p role="alert" className="rounded-lg border border-[#F6D3D0] bg-[#FDEDEC] px-3 py-2 text-[11.5px] font-medium text-[#A32B22]">
              {passwordState.error}
            </p>
          )}
          {passwordState.message && (
            <p className="rounded-lg border border-[#C9EBD9] bg-[#EAF7F0] px-3 py-2 text-[11.5px] font-medium text-[#0B7A45]">
              {passwordState.message}
            </p>
          )}
          <button type="submit" disabled={passwordState.busy} className="btn-ghost-line" aria-busy={passwordState.busy}>
            {passwordState.busy && <Loader2 className="size-4 animate-spin" />}
            Update password
          </button>
        </form>
      </section>

      <SignOutButton />
    </div>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#F6D3D0] bg-white py-3 text-[13px] font-semibold text-[#A32B22] transition-colors hover:bg-[#FDEDEC] disabled:opacity-60"
    >
      <LogOut className="size-4" />
      {busy ? "Signing out…" : "Sign out of this device"}
    </button>
  );
}
