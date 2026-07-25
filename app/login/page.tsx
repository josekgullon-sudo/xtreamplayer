import { redirect } from "next/navigation";

/** Los accesos se unifican en /acceso. */
export default function LoginPage() {
  redirect("/acceso");
}
