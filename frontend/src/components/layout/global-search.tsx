/**
 * Kotak cari di top bar. Mencari job, unit, driver, customer, dan penawaran
 * sekaligus; hasil yang dipilih langsung membuka halaman detailnya.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  FileText,
  Loader2,
  PackageCheck,
  Search,
  Truck,
  UserRound,
  X
} from "lucide-react";
import { MIN_SEARCH_LENGTH, type SearchHit, type SearchKind } from "@/features/search/api";
import { useGlobalSearch } from "@/features/search/queries";

const KIND_LABEL: Record<SearchKind, string> = {
  job: "Job",
  unit: "Unit",
  driver: "Driver",
  customer: "Customer",
  quotation: "Penawaran"
};

const KIND_ICON: Record<SearchKind, typeof Search> = {
  job: PackageCheck,
  unit: Truck,
  driver: UserRound,
  customer: Building2,
  quotation: FileText
};

/** Tunda pemanggilan API sampai ketikan berhenti sejenak. */
function useDebounced(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const isMac = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function GlobalSearch() {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const debounced = useDebounced(term);
  const { data, isFetching } = useGlobalSearch(debounced);

  const hits = useMemo<SearchHit[]>(() => data?.hits ?? [], [data]);
  const tooShort = term.trim().length > 0 && term.trim().length < MIN_SEARCH_LENGTH;
  // Hasil yang tampil masih milik kata kunci lama selama request berjalan.
  const stale = debounced !== term.trim();

  useEffect(() => setActive(0), [hits]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  // Pintasan ⌘K / Ctrl+K — hint di dalam kotak sebelumnya tidak terhubung
  // ke apa pun.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  function go(hit: SearchHit) {
    setOpen(false);
    setTerm("");
    inputRef.current?.blur();
    navigate(hit.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (term) setTerm("");
      else setOpen(false);
      return;
    }
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[active];
      if (hit) go(hit);
    }
  }

  const showPanel = open && term.trim().length > 0;

  return (
    <div ref={wrapRef} className="global-search">
      <div className="global-search-anchor">
        <span className="global-search-icon">
          {isFetching || stale ? (
            <Loader2 className="spin" style={{ width: 15, height: 15 }} />
          ) : (
            <Search style={{ width: 15, height: 15 }} />
          )}
        </span>
        <input
          ref={inputRef}
          className="input global-search-input"
          placeholder="Cari job, unit, driver, customer, penawaran…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="global-search-list"
          aria-autocomplete="list"
        />
        {term ? (
          <button
            type="button"
            className="global-search-clear"
            aria-label="Kosongkan pencarian"
            onClick={() => {
              setTerm("");
              inputRef.current?.focus();
            }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        ) : (
          <span className="global-search-kbd" aria-hidden>
            <span className="kbd">{isMac() ? "⌘" : "Ctrl"}</span>
            <span className="kbd">K</span>
          </span>
        )}

      {showPanel && (
        <div className="global-search-panel">
          {tooShort ? (
            <p className="global-search-empty">
              Ketik minimal {MIN_SEARCH_LENGTH} huruf
            </p>
          ) : hits.length === 0 ? (
            <p className="global-search-empty">
              {isFetching || stale ? "Mencari…" : `Tidak ada hasil untuk "${term.trim()}"`}
            </p>
          ) : (
            <div ref={listRef} id="global-search-list" role="listbox">
              {hits.map((hit, i) => {
                const Icon = KIND_ICON[hit.kind];
                return (
                  <button
                    key={`${hit.kind}-${hit.id}`}
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    data-index={i}
                    data-active={i === active}
                    className="global-search-hit"
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(hit)}
                  >
                    <Icon style={{ width: 15, height: 15, flexShrink: 0 }} />
                    <span className="global-search-hit-text">
                      <span className="global-search-hit-label">{hit.label}</span>
                      {hit.sublabel && (
                        <span className="global-search-hit-sub">{hit.sublabel}</span>
                      )}
                    </span>
                    <span className="global-search-kind">{KIND_LABEL[hit.kind]}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
