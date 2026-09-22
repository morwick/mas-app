/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Mesin kerja di kantor 8 GB dan dipakai berbarengan dengan browser. Secara
  // bawaan Next.js mem-fork worker perender sebanyak jumlah core; waktu memori
  // bebas tinggal ratusan MB, fork-nya gagal dan halaman jatuh dengan
  // "Jest worker encountered child process exceptions" — pesan yang tidak
  // menyebut baris kode mana pun karena kodenya memang belum sempat jalan.
  // Dibatasi dua supaya kompilasi tetap paralel tapi tidak memicu itu.
  experimental: {
    cpus: 2
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "picsum.photos" }
    ]
  }
};

export default nextConfig;
