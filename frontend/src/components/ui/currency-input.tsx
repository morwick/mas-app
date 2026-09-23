/**
 * Input rupiah bermask: menampilkan "Rp" di depan dan pemisah ribuan gaya
 * Indonesia (2.500.000), tapi nilai yang keluar selalu digit polos ("2500000")
 * supaya yang tersimpan tetap integer.
 */

import { forwardRef, useLayoutEffect, useRef, type InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/input";

/** Rupiah 15 digit sudah ratusan triliun — jauh di bawah batas aman Number. */
const MAX_DIGITS = 15;

const GROUPER = new Intl.NumberFormat("id-ID");

/** Buang semua selain angka, lalu rapikan nol di depan ("05" → "5"). */
export function toDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, MAX_DIGITS);
  return digits.replace(/^0+(?=\d)/, "");
}

/** "2500000" → "2.500.000"; kosong tetap kosong. */
export function formatDigits(digits: string): string {
  if (!digits) return "";
  return GROUPER.format(Number(digits));
}

/** Berapa angka yang ada sebelum posisi kursor — patokan agar kursor tak melompat. */
function digitsBefore(text: string, caret: number): number {
  let n = 0;
  for (let i = 0; i < caret && i < text.length; i++) {
    if (text[i] >= "0" && text[i] <= "9") n++;
  }
  return n;
}

/** Posisi kursor di teks terformat, tepat setelah angka ke-`count`. */
function caretAfterDigits(text: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] >= "0" && text[i] <= "9") {
      seen++;
      if (seen === count) return i + 1;
    }
  }
  return text.length;
}

interface CurrencyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** Digit polos tanpa pemisah; "" berarti kosong. */
  value: string;
  onChange: (digits: string) => void;
  error?: string;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  function CurrencyInput({ value, onChange, error, ...rest }, ref) {
    const innerRef = useRef<HTMLInputElement | null>(null);
    const pendingCaret = useRef<number | null>(null);

    const display = formatDigits(value);

    // Reformat mengubah panjang teks, jadi kursor dikembalikan ke angka yang
    // sama seperti sebelum diketik — kalau tidak, kursor selalu lompat ke ujung.
    useLayoutEffect(() => {
      const el = innerRef.current;
      const caret = pendingCaret.current;
      pendingCaret.current = null;
      if (el && caret !== null && document.activeElement === el) {
        el.setSelectionRange(caret, caret);
      }
    });

    return (
      <Input
        ref={(node) => {
          innerRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        error={error}
        leftIcon={<span style={{ fontSize: 13 }}>Rp</span>}
        onChange={(e) => {
          const raw = e.target.value;
          const wanted = digitsBefore(raw, e.target.selectionStart ?? raw.length);
          const digits = toDigits(raw);
          pendingCaret.current = caretAfterDigits(formatDigits(digits), wanted);
          onChange(digits);
        }}
        {...rest}
      />
    );
  }
);
