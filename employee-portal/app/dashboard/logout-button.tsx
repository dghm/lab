"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <button
      onClick={handleLogout}
      className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
    >
      登出
    </button>
  );
}
