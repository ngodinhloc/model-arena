"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PanelLeft, PanelRight, Plus, BarChart3, ChevronDown, ChevronRight, Swords } from "lucide-react";
import { getExperiments } from "@/lib/api";
import { ExperimentSummary } from "@/types/experiment";

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [history, setHistory] = useState<ExperimentSummary[]>([]);

  useEffect(() => {
    const refresh = () => getExperiments().then(setHistory).catch(() => {});
    refresh();
    window.addEventListener("experiment-completed", refresh);
    window.addEventListener("experiment-created", refresh);
    return () => {
      window.removeEventListener("experiment-completed", refresh);
      window.removeEventListener("experiment-created", refresh);
    };
  }, [pathname]);

  const navItemClass = (active: boolean) =>
    `flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors ${
      active
        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
        : "text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800/70"
    }`;

  return (
    <aside
      className={`flex h-screen shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-950 ${
        isOpen ? "w-72" : "w-14"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
        <button
          onClick={() => setIsOpen((v) => !v)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isOpen ? <PanelLeft size={16} /> : <PanelRight size={16} />}
        </button>
        {isOpen && (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
              <Swords size={13} />
            </span>
            Model Arena
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          <button onClick={() => router.push("/")} className={navItemClass(pathname === "/")}>
            <Plus size={15} className="shrink-0" />
            {isOpen && "New Experiment"}
          </button>
          <button
            onClick={() => router.push("/analytics")}
            className={navItemClass(pathname === "/analytics")}
          >
            <BarChart3 size={15} className="shrink-0" />
            {isOpen && "Analytics"}
          </button>
        </div>

        {isOpen && (
          <>
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="mt-5 flex w-full items-center gap-1 px-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400"
            >
              {historyOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              Histories
              {history.length > 0 && (
                <span className="ml-auto rounded-full bg-zinc-200 px-1.5 py-px text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {history.length}
                </span>
              )}
            </button>
            {historyOpen && (
              <div className="mt-1 space-y-0.5">
                {history.length === 0 && (
                  <p className="px-2.5 py-2 text-xs text-zinc-400 dark:text-zinc-600">No experiments yet</p>
                )}
                {history.map((item) => {
                  const active = pathname === `/experiments/${item.uuid}`;
                  return (
                    <button
                      key={item.uuid}
                      title={item.topic}
                      onClick={() => router.push(`/experiments/${item.uuid}`)}
                      className={`flex w-full flex-col rounded-xl px-2.5 py-2 text-left text-sm transition-colors ${
                        active
                          ? "bg-indigo-50 dark:bg-indigo-500/10"
                          : "hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70"
                      }`}
                    >
                      <span
                        className={`truncate ${
                          active
                            ? "font-medium text-indigo-700 dark:text-indigo-300"
                            : "text-zinc-600 dark:text-zinc-400"
                        }`}
                      >
                        {item.topic}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-600">
                        <span
                          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                            item.status === "completed" ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
                          }`}
                        />
                        {item.category}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </nav>
    </aside>
  );
}
