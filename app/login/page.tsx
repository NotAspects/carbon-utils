import { getSessionUser, isAdmin } from "@/lib/auth";
import LoginClient from "./LoginClient";

export default async function LoginPage() {
  const user = await getSessionUser();
  const denied = Boolean(user?.id && !isAdmin(user.id));
  return <LoginClient denied={denied} />;
}
