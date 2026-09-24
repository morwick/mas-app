/**
 * Dropdown yang bisa dicari — pengganti `<Select>` untuk daftar panjang
 * (customer, unit, driver). Daftar dirender lewat portal dengan posisi
 * `fixed` supaya tidak terpotong oleh container ber-`overflow` (isi Modal,
 * toolbar, kartu form).
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  /** Teks utama; ikut dicari. */
  label: string;
  /** Baris kedua abu-abu; ikut dicari juga. */
  hint?: string;
  disabled?: boolean;
}

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  /** Teks saat belum ada pilihan — sekaligus jadi opsi kosong bila `clearable`. */
  placeholder?: string;
  searchPlaceholder?: string;
  error?: string;
  disabled?: boolean;
  /** Tampilkan tombol silang untuk mengosongkan pilihan. */
  clearable?: boolean;
  emptyText?: string;
  /**
   * Opsi baru tampil setelah kata kunci minimal sepanjang ini. Berguna untuk
   * daftar nama orang: tidak semua nama langsung terpampang saat dibuka.
   */
  minQueryLength?: number;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
}

const MAX_LIST_HEIGHT = 260;
/** Tinggi kotak cari + padding list; dipakai untuk hitung ruang flip ke atas. */
const POPUP_CHROME = 52;

function normalize(text: string) {
  return text.toLowerCase();
}

/** Cocok bila SEMUA kata kunci ada di label/hint — "abc jakarta" boleh terbalik. */
function matches(option: ComboboxOption, terms: string[]) {
  if (terms.length === 0) return true;
  const haystack = normalize(`${option.label} ${option.hint ?? ""}`);
  return terms.every((t) => haystack.includes(t));
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Pilih…",
  searchPlaceholder = "Ketik untuk mencari…",
  error,
  disabled,
  clearable,
  emptyText = "Tidak ada hasil",
  minQueryLength = 0,
  className,
  style,
  id
}: ComboboxProps) {
  const reactId = useId();
  const listId = `${id ?? reactId}-list`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; flip: boolean }>({
    left: 0,
    top: 0,
    width: 0,
    flip: false
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  const queryTooShort = query.trim().length < minQueryLength;

  const filtered = useMemo(() => {
    if (queryTooShort) return [];
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return options.filter((o) => matches(o, terms));
  }, [options, query, queryTooShort]);

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const needed = MAX_LIST_HEIGHT + POPUP_CHROME;
    // Buka ke atas hanya bila di bawah sempit DAN di atas lebih lega.
    const flip = below < needed && r.top > below;
    setRect({
      left: r.left,
      top: flip ? r.top : r.bottom,
      width: r.width,
      flip
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => reposition();
    // capture: true supaya scroll di container manapun ikut tertangkap.
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (popupRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  // Fokus ke kotak cari begitu terbuka.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // Setiap kali hasil filter berubah, sorot kandidat pertama yang bisa dipilih.
  useEffect(() => {
    if (!open) return;
    const preferred = filtered.findIndex((o) => o.value === value && !o.disabled);
    const firstEnabled = filtered.findIndex((o) => !o.disabled);
    setActiveIndex(preferred >= 0 ? preferred : firstEnabled >= 0 ? firstEnabled : 0);
  }, [open, filtered, value]);

  // Jaga baris aktif tetap terlihat saat navigasi keyboard.
  useEffect(() => {
    if (!open) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    // Optional call: jsdom (dan beberapa browser lawas) tidak punya scrollIntoView.
    row?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeIndex]);

  function openPopup() {
    if (disabled) return;
    setQuery("");
    setOpen(true);
  }

  function closePopup(refocus = true) {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  }

  function pick(option: ComboboxOption) {
    if (option.disabled) return;
    onChange(option.value);
    closePopup();
  }

  /** Geser sorotan ke opsi aktif berikutnya, melewati yang disabled. */
  function move(step: 1 | -1) {
    if (filtered.length === 0) return;
    let next = activeIndex;
    for (let i = 0; i < filtered.length; i++) {
      next = (next + step + filtered.length) % filtered.length;
      if (!filtered[next].disabled) {
        setActiveIndex(next);
        return;
      }
    }
  }

  function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (open) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPopup();
    }
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(Math.max(0, filtered.findIndex((o) => !o.disabled)));
        break;
      case "End": {
        e.preventDefault();
        for (let i = filtered.length - 1; i >= 0; i--) {
          if (!filtered[i].disabled) {
            setActiveIndex(i);
            break;
          }
        }
        break;
      }
      case "Enter": {
        e.preventDefault();
        const option = filtered[activeIndex];
        if (option) pick(option);
        break;
      }
      case "Escape":
        e.preventDefault();
        // stopPropagation supaya Escape tidak ikut menutup Modal induk.
        e.stopPropagation();
        closePopup();
        break;
      case "Tab":
        closePopup(false);
        break;
    }
  }

  const popup = open
    ? createPortal(
        <div
          ref={popupRef}
          className="combobox-popup"
          style={{
            left: rect.left,
            width: rect.width,
            ...(rect.flip
              ? { bottom: window.innerHeight - rect.top + 4 }
              : { top: rect.top + 4 })
          }}
        >
          <div className="combobox-search">
            <Search style={{ width: 15, height: 15, color: "var(--text-tertiary)", flexShrink: 0 }} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={searchPlaceholder}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined
              }
            />
          </div>
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            className="combobox-list"
            style={{ maxHeight: MAX_LIST_HEIGHT }}
          >
            {filtered.length === 0 ? (
              <p className="combobox-empty">
                {queryTooShort
                  ? `Ketik minimal ${minQueryLength} huruf untuk menampilkan pilihan`
                  : emptyText}
              </p>
            ) : (
              filtered.map((option, index) => (
                <div
                  key={option.value}
                  id={`${listId}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled || undefined}
                  data-active={index === activeIndex}
                  data-selected={option.value === value}
                  data-disabled={!!option.disabled}
                  className="combobox-option"
                  onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                  // mousedown di-cegah supaya fokus tidak lepas dari kotak cari.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(option)}
                >
                  <div className="combobox-option-main">
                    <span className="combobox-option-label">{option.label}</span>
                    {option.value === value && (
                      <Check style={{ width: 15, height: 15, flexShrink: 0 }} />
                    )}
                  </div>
                  {option.hint && <span className="combobox-hint">{option.hint}</span>}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  const showClear = clearable && !!value && !disabled;

  return (
    <div className="w-full">
      <div style={{ position: "relative" }}>
        <button
          ref={triggerRef}
          type="button"
          id={id}
          disabled={disabled}
          className={cn("input combobox-trigger", className)}
          style={{ borderColor: error ? "#c13838" : undefined, ...style }}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => (open ? closePopup() : openPopup())}
          onKeyDown={onTriggerKeyDown}
        >
          <span
            className={cn("combobox-value", !selected && "combobox-placeholder")}
          >
            {selected ? selected.label : placeholder}
          </span>
          {showClear ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Kosongkan pilihan"
              className="combobox-clear"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
            >
              <X style={{ width: 14, height: 14 }} />
            </span>
          ) : (
            <ChevronDown
              style={{ width: 16, height: 16, color: "var(--text-secondary)", flexShrink: 0 }}
            />
          )}
        </button>
      </div>
      {error && (
        <p className="field-error" style={{ marginTop: 4 }}>
          {error}
        </p>
      )}
      {popup}
    </div>
  );
}
