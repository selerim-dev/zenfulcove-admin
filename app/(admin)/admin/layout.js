import { cookies } from "next/headers";
import LoginScreen from "@/components/LoginScreen";

export default async function AdminLayout({ children }) {
  const cookieStore = await cookies();
  const authenticated = cookieStore.get("zc_admin_auth")?.value === "true";

  if (!authenticated) {
    return <LoginScreen />;
  }

  return children;
}
