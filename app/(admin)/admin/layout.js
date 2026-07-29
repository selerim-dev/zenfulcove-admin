import { hasAdminSessionCookie } from "@/lib/adminAuth";
import LoginScreen from "@/components/LoginScreen";

export default async function AdminLayout({ children }) {
  const authenticated = await hasAdminSessionCookie();

  if (!authenticated) {
    return <LoginScreen />;
  }

  return children;
}
