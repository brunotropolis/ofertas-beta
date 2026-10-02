import { redirect } from "next/navigation";

// O dashboard virou a tela Início.
export default function DashboardPage() {
  redirect("/inicio");
}
