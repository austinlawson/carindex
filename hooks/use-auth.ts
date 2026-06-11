"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type AuthMode = "sign-in" | "sign-up";

export function useAuth() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      setAuthError(error?.message ?? null);
      setLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signIn = useCallback(
    async ({ email, password }: { email: string; password: string }) => {
      if (!supabase) {
        return { error: "Supabase is not configured." };
      }

      setAuthError(null);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setAuthError(error?.message ?? null);
      return { error: error?.message ?? null };
    },
    [supabase]
  );

  const signUp = useCallback(
    async ({ email, password }: { email: string; password: string }) => {
      if (!supabase) {
        return { error: "Supabase is not configured.", needsEmailConfirmation: false };
      }

      setAuthError(null);
      const { data, error } = await supabase.auth.signUp({ email, password });
      const needsEmailConfirmation = Boolean(data.user && !data.session);
      setAuthError(error?.message ?? null);
      return { error: error?.message ?? null, needsEmailConfirmation };
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
  }, [supabase]);

  const deleteAccount = useCallback(async () => {
    if (!supabase) {
      return { error: "Supabase is not configured." };
    }

    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return { error: sessionError?.message ?? "You must be signed in to delete your account." };
    }

    const response = await fetch("/api/account/delete", {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.access_token}`
      }
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      return { error: payload?.error ?? "Could not delete account." };
    }

    await supabase.auth.signOut();
    setUser(null);
    return { error: null };
  }, [supabase]);

  return {
    user,
    loading,
    authError,
    configured: Boolean(supabase),
    signIn,
    signUp,
    signOut,
    deleteAccount
  };
}
