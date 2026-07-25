import { redirect } from "next/navigation";

/** El acceso de proveedor vive dentro del selector unificado de /acceso. */
export default function ProviderLoginPage() {
  redirect("/acceso?rol=proveedor");
}
