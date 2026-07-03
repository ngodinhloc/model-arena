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

  return (
    <aside
      className={`flex h-screen shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-950 ${
        isOpen ? "w-72" : "w-14"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
        <button
          onClick={() => setIsOpen((v) => !v)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isOpen ? <PanelLeft size={16} /> : <PanelRight size={16} />}
        </button>
        {isOpen && (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            <Swords size={15} className="text-indigo-500" />
            ModelArena
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <button
          onClick={() => router.push("/")}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Plus size={15} className="shrink-0" />
          {isOpen && "New Experiment"}
        </button>
        <button
          onClick={() => router.push("/analytics")}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <BarChart3 size={15} className="shrink-0" />
          {isOpen && "Analytics"}
        </button>

        {isOpen && (
          <>
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="mt-4 flex w-full items-center gap-1 px-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400"
            >
              {historyOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              Histories
            </button>
            {historyOpen &&
              history.map((item) => (
                <button
                  key={item.uuid}
                  title={item.topic}
                  onClick={() => router.push(`/experiments/${item.uuid}`)}
                  className="mt-1 flex w-full flex-col rounded-md px-2 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  <span className="truncate">{item.topic}</span>
                  <span className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-600">
                    {item.category}
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        item.status === "completed" ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
                      }`}
                    />
                  </span>
                </button>
              ))}
          </>
        )}
      </nav>
    </aside>
  );
}
