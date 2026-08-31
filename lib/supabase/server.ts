import { cookies } from "next/headers";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import { isWithdrawn } from "@/lib/domain/account/withdrawal";

type CookieToSet = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

export function hasSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function hasSupabaseAdminEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export const createSupabaseServerClient = cache(async () => {
  if (!hasSupabaseEnv()) {
    throw new Error("Supabaseの環境変数が設定されていません");
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot always set cookies. Server Actions can.
          }
        }
      }
    }
  );
});

export function createSupabaseAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabaseの管理用環境変数が設定されていません");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export const getCurrentUserId = cache(async () => {
  const user = await getCurrentUser();
  return user?.id ?? null;
});

export const getCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return user;
});

export const getCurrentActiveUser = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  if (isWithdrawn(user.app_metadata)) return null;
  return user;
});

export const getCurrentActiveUserId = cache(async () => {
  const user = await getCurrentActiveUser();
  return user?.id ?? null;
});
