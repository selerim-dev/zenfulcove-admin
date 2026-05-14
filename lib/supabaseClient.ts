import { createBrowserClient } from "@supabase/ssr";

type SupabaseBrowserClient = ReturnType<typeof createBrowserClient>;

const missingEnvMessage =
  "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";

function createMissingClient(): SupabaseBrowserClient {
  const throwMissing = () => {
    throw new Error(missingEnvMessage);
  };

  return new Proxy(
    {},
    {
      get: () => throwMissing,
    }
  ) as SupabaseBrowserClient;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseBrowserClient =
  supabaseUrl && supabaseAnonKey
    ? createBrowserClient(supabaseUrl, supabaseAnonKey)
    : createMissingClient();
