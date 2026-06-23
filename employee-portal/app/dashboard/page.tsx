import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { listAnnouncements } from "@/lib/airtable";
import LogoutButton from "./logout-button";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const announcements = await listAnnouncements();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-6 py-4 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-800">員工 Portal</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">你好，{session.name}</span>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <h2 className="mb-4 text-base font-semibold text-gray-700">公告</h2>
        <div className="space-y-3">
          {announcements.length === 0 && (
            <p className="text-sm text-gray-400">目前沒有公告</p>
          )}
          {announcements.map((a) => (
            <div key={a.id} className="rounded-lg bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-800">{a.title}</h3>
                {a.pinned && (
                  <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
                    置頂
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500">{a.content}</p>
              <p className="mt-2 text-xs text-gray-400">{a.postedDate}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
