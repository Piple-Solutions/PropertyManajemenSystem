/**
 * DUMMY CONTENT - replace before launch.
 *
 * Every string, number and contact value in this file is a PLACEHOLDER for the
 * public website of Homestay Joglo Seruni Syariah. Nothing here is a verified
 * business fact (no certifications, awards, ratings, distances or real
 * addresses). Replace the values flagged "DUMMY" with real information.
 *
 * Components read from this file; no copy is hard-coded in JSX.
 */

export type IconKey =
  | 'sofa'
  | 'leaf'
  | 'sparkles'
  | 'heart'
  | 'wifi'
  | 'car'
  | 'utensils'
  | 'trees'
  | 'bed'
  | 'sunrise';

export interface NavLinkItem {
  label: string;
  to: string;
}

export interface HighlightItem {
  icon: IconKey;
  title: string;
  text: string;
}

export interface RoomFallback {
  id: string;
  name: string;
  description: string;
  capacity: number;
  facilities: string[];
  /** DUMMY: shown as "Rp xxx.000" until a real rate comes from the API. */
  priceLabel: string;
}

export interface FacilityItem {
  icon: IconKey;
  title: string;
  text: string;
  tone: 'light' | 'warm' | 'dark';
}

export interface GalleryTile {
  id: string;
  label: string;
  category: string;
  aspect: 'wide' | 'tall' | 'square';
  /** Optional real photo; while absent a designed placeholder is shown. */
  src?: string;
  alt?: string;
}

export interface TitledText {
  title: string;
  text: string;
}


export interface Testimonial {
  quote: string;
  /** DUMMY: generic attribution, no real person. */
  who: string;
}

export interface FaqItem {
  q: string;
  a: string;
}

/** DUMMY: the number already used by the project (placeholder). */
export const WHATSAPP_NUMBER = '6200000000000';

export function buildWhatsAppUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export const site = {
  name: 'Homestay Joglo Seruni Syariah',
  shortName: 'Joglo Seruni',
  tagline: 'Tempat berteduh yang hangat untuk keluarga.',
  /** DUMMY contact values. */
  phone: '+62 8xx-xxxx-xxxx',
  email: 'halo@contoh.id',
  address: 'Jl. Contoh No. 00, Kota Contoh',
  hours: 'Setiap hari, jam layanan akan diumumkan',
} as const;

export const nav: NavLinkItem[] = [
  { label: 'Beranda', to: '/' },
  { label: 'Tentang', to: '/about' },
  { label: 'Kamar', to: '/rooms' },
  { label: 'Galeri', to: '/gallery' },
  { label: 'Kontak', to: '/contact' },
];

export const chrome = {
  skipLink: 'Lewati ke konten utama',
  menuOpen: 'Buka menu navigasi',
  menuClose: 'Tutup menu navigasi',
  backToTop: 'Kembali ke atas',
  headerCta: 'Hubungi via WhatsApp',
  headerCtaMessage: 'Halo, saya ingin bertanya tentang homestay.',
  footerNavTitle: 'Jelajahi',
  footerContactTitle: 'Kontak',
  footerNote: 'Homestay keluarga bernuansa joglo.',
} as const;

export const home = {
  title: 'Beranda',
  hero: {
    eyebrow: 'Homestay syariah ramah keluarga',
    title: 'Selamat datang di Joglo Seruni',
    subtitle: 'Menginap tenang di rumah joglo yang hangat, bersih, dan nyaman untuk seluruh keluarga.',
    primaryCta: 'Hubungi via WhatsApp',
    primaryMessage: 'Halo, saya ingin informasi kamar.',
    secondaryCta: 'Lihat Kamar',
    mediaLabel: 'Foto akan ditambahkan',
  },
  availability: {
    title: 'Cek ketersediaan',
    subtitle: 'Pilih tanggal menginap, lalu kami bantu lewat WhatsApp.',
    checkIn: 'Check-in',
    checkOut: 'Check-out',
    adults: 'Dewasa',
    children: 'Anak',
    submit: 'Cek ketersediaan',
    errorTitle: 'Ada yang perlu diperbaiki',
    errCheckIn: 'Pilih tanggal check-in.',
    errCheckOut: 'Pilih tanggal check-out.',
    errOrder: 'Tanggal check-out harus setelah tanggal check-in.',
  },
  highlights: [
    { icon: 'sofa', title: 'Ruang berkumpul', text: 'Area bersama yang lega untuk makan dan berbincang.' },
    { icon: 'leaf', title: 'Suasana teduh', text: 'Halaman rindang dengan sirkulasi udara yang baik.' },
    { icon: 'sparkles', title: 'Kebersihan terjaga', text: 'Kamar dan area bersama dibersihkan setiap hari.' },
    { icon: 'heart', title: 'Sambutan ramah', text: 'Pengelola siap membantu kebutuhan selama menginap.' },
  ] as HighlightItem[],
  about: {
    eyebrow: 'Tentang kami',
    title: 'Rumah joglo yang menyambut dengan tenang',
    paragraphs: [
      'Joglo Seruni dirancang sebagai tempat singgah yang sederhana, rapi, dan menenangkan bagi keluarga.',
      'Atap tumpang, ruang tengah yang lega, dan kayu yang hangat menjadi cara kami menyambut tamu.',
    ],
    cta: 'Kenali Joglo Seruni',
    cardTitle: 'Konsep joglo',
    cardText: 'Atap tumpang, ruang tengah lega, dan sentuhan kayu yang hangat.',
  },
  rooms: {
    title: 'Pilihan kamar',
    subtitle: 'Kamar bersih dan tenang untuk perjalanan keluarga. Harga dan fasilitas mengikuti tipe kamar.',
    priceFrom: 'per malam, mulai dari',
    detail: 'Lihat detail',
    all: 'Lihat semua kamar',
    capacity: 'orang',
    more: 'lainnya',
    fallback: [
      {
        id: 'dummy-keluarga',
        name: 'Kamar keluarga',
        description: 'Kamar luas untuk keluarga kecil dengan ruang gerak yang nyaman.',
        capacity: 4,
        facilities: ['Pendingin ruangan', 'Kamar mandi dalam', 'Wi-Fi'],
        priceLabel: 'Rp xxx.000',
      },
      {
        id: 'dummy-twin',
        name: 'Kamar twin',
        description: 'Dua tempat tidur terpisah, cocok untuk berdua atau bersama teman.',
        capacity: 2,
        facilities: ['Pendingin ruangan', 'Wi-Fi'],
        priceLabel: 'Rp xxx.000',
      },
      {
        id: 'dummy-rombongan',
        name: 'Kamar rombongan',
        description: 'Ruang lebih besar untuk rombongan keluarga yang menginap bersama.',
        capacity: 6,
        facilities: ['Pendingin ruangan', 'Kamar mandi dalam', 'Ruang duduk'],
        priceLabel: 'Rp xxx.000',
      },
    ] as RoomFallback[],
  },
  facilities: {
    title: 'Fasilitas untuk kenyamanan keluarga',
    subtitle: 'Contoh fasilitas yang akan disesuaikan dengan kondisi sebenarnya.',
    items: [
      { icon: 'bed', title: 'Kamar bersih dan nyaman', text: 'Tempat tidur rapi dengan perlengkapan dasar yang lengkap.', tone: 'light' },
      { icon: 'utensils', title: 'Dapur dan ruang makan', text: 'Ruang makan bersama untuk menikmati hidangan bersama keluarga.', tone: 'dark' },
      { icon: 'wifi', title: 'Wi-Fi', text: 'Koneksi untuk kebutuhan sehari-hari selama menginap.', tone: 'warm' },
      { icon: 'car', title: 'Area parkir', text: 'Tempat memarkir kendaraan keluarga dengan aman.', tone: 'light' },
      { icon: 'trees', title: 'Halaman rindang', text: 'Ruang terbuka untuk bersantai di pagi dan sore hari.', tone: 'warm' },
      { icon: 'sunrise', title: 'Perlengkapan ibadah', text: 'Perlengkapan ibadah tersedia untuk kenyamanan tamu muslim.', tone: 'dark' },
    ] as FacilityItem[],
  },
  gallery: {
    eyebrow: 'Galeri',
    title: 'Sekilas suasana',
    subtitle: 'Foto resmi akan segera ditambahkan. Berikut gambaran susunan galeri.',
    cta: 'Lihat galeri lengkap',
    tiles: [
      { id: 'g1', label: 'Ruang tengah', category: 'Ruang bersama', aspect: 'wide' },
      { id: 'g2', label: 'Kamar tidur', category: 'Kamar', aspect: 'tall' },
      { id: 'g3', label: 'Teras', category: 'Eksterior', aspect: 'square' },
      { id: 'g4', label: 'Halaman', category: 'Eksterior', aspect: 'square' },
      { id: 'g5', label: 'Ruang makan', category: 'Ruang bersama', aspect: 'wide' },
    ] as GalleryTile[],
  },
  testimonials: {
    title: 'Cerita dari tamu',
    note: 'Contoh kutipan, akan diganti dengan ulasan tamu sebenarnya.',
    items: [
      {
        quote: 'Suasananya tenang dan bersih, anak-anak betah. Pengelolanya ramah dan sigap membantu.',
        who: 'Tamu keluarga',
      },
      {
        quote: 'Cocok untuk berkumpul bersama keluarga besar. Ruangnya lega dan nyaman.',
        who: 'Tamu rombongan keluarga',
      },
      {
        quote: 'Kamar rapi, pelayanan sopan, dan mudah dihubungi lewat WhatsApp.',
        who: 'Tamu perjalanan keluarga',
      },
    ] as Testimonial[],
  },
  faq: {
    title: 'Pertanyaan yang sering diajukan',
    items: [
      {
        q: 'Bagaimana cara memesan kamar?',
        a: 'Hubungi kami lewat WhatsApp dengan menyebutkan tanggal menginap dan jumlah tamu. Kami akan membantu mengecek ketersediaan.',
      },
      {
        q: 'Bagaimana dengan jam check-in dan check-out?',
        a: 'Jam masuk dan keluar mengikuti ketentuan yang diinformasikan pengelola saat pemesanan.',
      },
      {
        q: 'Apakah menerima keluarga besar atau rombongan kecil?',
        a: 'Ya. Sebutkan jumlah tamu saat memesan agar kami menyiapkan kamar yang sesuai.',
      },
      {
        q: 'Apakah ada aturan rumah?',
        a: 'Kami menjaga suasana tetap tenang dan sopan di seluruh area. Ketentuan lengkap disampaikan saat pemesanan.',
      },
    ] as FaqItem[],
  },
  cta: {
    title: 'Rencanakan menginap Anda',
    subtitle: 'Tanyakan ketersediaan kamar dan harga langsung kepada pengelola.',
    primary: 'Hubungi via WhatsApp',
    primaryMessage: 'Halo, saya ingin reservasi kamar.',
    secondary: 'Lihat kontak',
  },
};

/* ==========================================================================
 * Inner pages (About, Rooms, Gallery, Contact, 404). Same rules as above:
 * every line is DUMMY copy to be replaced with verified information.
 * ========================================================================== */

export interface PageCtaContent {
  title: string;
  subtitle: string;
  primary: string;
  primaryMessage: string;
  secondary: string;
  secondaryTo: string;
}

export interface PageHeroContent {
  eyebrow: string;
  title: string;
  subtitle: string;
}

export const about = {
  title: 'Tentang',
  hero: {
    eyebrow: 'Tentang kami',
    title: 'Tentang Joglo Seruni',
    subtitle: 'Homestay bernuansa joglo yang dirancang sederhana, rapi, dan menenangkan untuk keluarga.',
  } as PageHeroContent,
  story: {
    eyebrow: 'Kisah singkat',
    title: 'Tempat singgah yang terasa seperti rumah',
    paragraphs: [
      'Joglo Seruni hadir sebagai tempat singgah bagi keluarga yang mencari suasana tenang dan tertata. Kami ingin tamu merasa disambut seperti di rumah sendiri.',
      'Rumah joglo dipilih karena bentuknya yang teduh. Atap yang menaungi, ruang tengah yang lega, dan kayu yang hangat membuat siapa pun mudah beristirahat.',
      'Kamar dan area bersama dijaga tetap bersih, nyaman, dan sederhana, agar perjalanan keluarga Anda terasa ringan.',
    ],
    mediaLabel: 'Foto akan ditambahkan',
  },
  concept: {
    eyebrow: 'Konsep joglo',
    title: 'Tiga unsur yang menjadi inspirasi',
    subtitle:
      'Rumah joglo tradisional dikenal lewat bentuk atap dan pembagian ruangnya. Unsur berikut menginspirasi suasana Joglo Seruni.',
    items: [
      { title: 'Atap tumpang', text: 'Atap bertingkat yang menaungi ruang di bawahnya, memberi kesan teduh dan tenang.' },
      { title: 'Ruang tengah', text: 'Ruang utama yang lega sebagai tempat berkumpul, makan, dan berbincang bersama.' },
      { title: 'Pendopo', text: 'Ruang terbuka untuk menerima tamu, tempat bersantai dengan sirkulasi udara yang baik.' },
    ] as TitledText[],
    note: 'Uraian ini bersifat umum dan akan disesuaikan dengan bangunan sebenarnya.',
  },
  values: {
    title: 'Nilai yang kami jaga',
    items: [
      { icon: 'leaf', title: 'Ketenangan', text: 'Suasana yang teduh dan tidak tergesa, agar tamu benar-benar beristirahat.' },
      { icon: 'sparkles', title: 'Kebersihan', text: 'Kamar dan area bersama dirawat rapi sebagai hal yang paling mendasar.' },
      { icon: 'heart', title: 'Keramahan', text: 'Sapaan yang sopan dan hangat, dengan bantuan yang mudah dihubungi.' },
      { icon: 'sofa', title: 'Kesederhanaan', text: 'Perlengkapan secukupnya yang tertata, tanpa berlebihan.' },
    ] as HighlightItem[],
  },
  welcome: {
    title: 'Cara kami menyambut tamu',
    steps: [
      { title: 'Sebelum tiba', text: 'Anda menyampaikan tanggal dan jumlah tamu lewat WhatsApp, lalu kami membantu menyiapkan kamar.' },
      { title: 'Saat tiba', text: 'Pengelola menyambut Anda, menjelaskan area rumah, dan memastikan kamar siap digunakan.' },
      { title: 'Selama menginap', text: 'Kebutuhan Anda dapat disampaikan kapan saja kepada pengelola agar segera dibantu.' },
    ] as TitledText[],
  },
  cta: {
    title: 'Ingin mengenal lebih jauh?',
    subtitle: 'Tanyakan apa saja tentang properti, kamar, dan suasana menginap kepada pengelola.',
    primary: 'Hubungi via WhatsApp',
    primaryMessage: 'Halo, saya ingin informasi properti.',
    secondary: 'Lihat kamar',
    secondaryTo: '/rooms',
  } as PageCtaContent,
};

export const roomsPage = {
  title: 'Kamar',
  hero: {
    eyebrow: 'Pilihan kamar',
    title: 'Kamar untuk keluarga Anda',
    subtitle:
      'Setiap tipe kamar dijaga bersih dan tenang. Pilih yang sesuai dengan jumlah tamu, lalu tanyakan ketersediaan lewat WhatsApp.',
  } as PageHeroContent,
  list: {
    title: 'Tipe kamar',
    photo: 'Foto akan ditambahkan',
    capacity: 'orang',
    price: 'per malam',
    ask: 'Tanya ketersediaan',
    /** `{room}` is replaced with the room type name. */
    askMessage: 'Halo, saya ingin menanyakan ketersediaan {room}.',
    more: 'Tampilkan kamar lainnya',
    /** `{shown}` and `{total}` are replaced with numbers. */
    shown: 'Menampilkan {shown} dari {total} tipe kamar',
    sampleNote: 'Daftar kamar ini contoh. Hubungi kami untuk tipe dan harga terbaru.',
  },
  included: {
    title: 'Yang Anda dapatkan di setiap kamar',
    items: [
      { icon: 'bed', title: 'Tempat tidur bersih', text: 'Linen dan perlengkapan tidur disiapkan rapi sebelum Anda tiba.' },
      { icon: 'sparkles', title: 'Perawatan harian', text: 'Kamar dan area bersama dibersihkan secara teratur.' },
      { icon: 'leaf', title: 'Suasana tenang', text: 'Lingkungan teduh yang nyaman untuk beristirahat bersama keluarga.' },
      { icon: 'heart', title: 'Bantuan pengelola', text: 'Kebutuhan selama menginap dapat disampaikan langsung kepada pengelola.' },
    ] as HighlightItem[],
  },
  rules: {
    title: 'Aturan rumah ringkas',
    note: 'Contoh aturan umum. Ketentuan resmi akan disampaikan saat pemesanan.',
    items: [
      { q: 'Menjaga ketenangan', a: 'Mohon menjaga ketenangan agar seluruh tamu dapat beristirahat dengan nyaman.' },
      { q: 'Menjaga kebersihan', a: 'Bantu kami merawat kebersihan kamar dan area bersama selama menginap.' },
      { q: 'Jumlah tamu', a: 'Sebutkan jumlah tamu saat memesan agar kamar yang disiapkan sesuai kebutuhan.' },
      { q: 'Fasilitas', a: 'Mohon memakai fasilitas dengan baik dan melapor kepada pengelola bila ada kendala.' },
    ] as FaqItem[],
  },
  cta: {
    title: 'Belum yakin memilih kamar?',
    subtitle: 'Sebutkan jumlah tamu dan tanggal menginap, kami bantu pilihkan yang paling sesuai.',
    primary: 'Hubungi via WhatsApp',
    primaryMessage: 'Halo, mohon bantu memilih tipe kamar yang sesuai.',
    secondary: 'Lihat galeri',
    secondaryTo: '/gallery',
  } as PageCtaContent,
};

export const galleryPage = {
  title: 'Galeri',
  hero: {
    eyebrow: 'Galeri',
    title: 'Galeri Joglo Seruni',
    subtitle: 'Gambaran suasana kamar, ruang bersama, dan halaman. Foto resmi akan segera ditambahkan.',
  } as PageHeroContent,
  filterLabel: 'Filter kategori foto',
  all: 'Semua',
  /** `{shown}` and `{total}` are replaced with numbers. */
  count: 'Menampilkan {shown} dari {total} foto',
  openPhoto: 'Buka foto',
  placeholderLabel: 'Foto akan ditambahkan',
  lightbox: {
    label: 'Pratinjau foto',
    close: 'Tutup pratinjau',
    prev: 'Foto sebelumnya',
    next: 'Foto berikutnya',
    /** `{i}` and `{n}` are replaced with numbers. */
    position: 'Foto {i} dari {n}',
  },
  categories: ['Kamar', 'Ruang bersama', 'Halaman', 'Eksterior'],
  tiles: [
    { id: 'p1', label: 'Ruang tengah', category: 'Ruang bersama', aspect: 'wide' },
    { id: 'p2', label: 'Kamar keluarga', category: 'Kamar', aspect: 'tall' },
    { id: 'p3', label: 'Teras depan', category: 'Eksterior', aspect: 'square' },
    { id: 'p4', label: 'Halaman', category: 'Halaman', aspect: 'square' },
    { id: 'p5', label: 'Ruang makan', category: 'Ruang bersama', aspect: 'wide' },
    { id: 'p6', label: 'Kamar twin', category: 'Kamar', aspect: 'square' },
    { id: 'p7', label: 'Taman', category: 'Halaman', aspect: 'tall' },
    { id: 'p8', label: 'Atap joglo', category: 'Eksterior', aspect: 'wide' },
    { id: 'p9', label: 'Ruang duduk', category: 'Ruang bersama', aspect: 'square' },
    { id: 'p10', label: 'Tempat tidur', category: 'Kamar', aspect: 'square' },
    { id: 'p11', label: 'Pendopo', category: 'Eksterior', aspect: 'wide' },
    { id: 'p12', label: 'Sudut halaman', category: 'Halaman', aspect: 'square' },
  ] as GalleryTile[],
  cta: {
    title: 'Suka dengan suasananya?',
    subtitle: 'Hubungi pengelola untuk menanyakan ketersediaan kamar pada tanggal yang Anda inginkan.',
    primary: 'Hubungi via WhatsApp',
    primaryMessage: 'Halo, saya ingin informasi kamar setelah melihat galeri.',
    secondary: 'Lihat kamar',
    secondaryTo: '/rooms',
  } as PageCtaContent,
};

export const contactPage = {
  title: 'Kontak',
  hero: {
    eyebrow: 'Kontak',
    title: 'Hubungi Kami',
    subtitle:
      'Sampaikan tanggal menginap dan jumlah tamu. Kami bantu mengecek ketersediaan dan menjawab pertanyaan Anda.',
  } as PageHeroContent,
  primaryCta: 'Hubungi via WhatsApp',
  primaryMessage: 'Halo, saya ingin informasi pemesanan.',
  details: {
    title: 'Informasi kontak',
    note: 'Seluruh nilai di bawah ini contoh dan akan diganti data sebenarnya.',
    labels: {
      phone: 'Telepon / WhatsApp',
      email: 'Email',
      address: 'Alamat',
      hours: 'Jam layanan',
    },
  },
  quick: {
    title: 'Pesan cepat',
    subtitle: 'Pilih topik, pesan WhatsApp akan terisi otomatis.',
    items: [
      { label: 'Tanya ketersediaan', message: 'Halo, saya ingin menanyakan ketersediaan kamar.' },
      { label: 'Tanya harga', message: 'Halo, saya ingin menanyakan harga kamar.' },
      { label: 'Tanya fasilitas', message: 'Halo, saya ingin menanyakan fasilitas homestay.' },
      { label: 'Rombongan keluarga', message: 'Halo, kami rombongan keluarga dan ingin menanyakan kamar.' },
    ],
  },
  map: {
    title: 'Lokasi',
    label: 'Peta lokasi akan ditambahkan',
    note: 'Alamat lengkap dan petunjuk arah akan dicantumkan di sini.',
  },
  faq: {
    title: 'Sebelum menghubungi',
    items: [
      {
        q: 'Informasi apa yang perlu saya siapkan?',
        a: 'Tanggal check-in dan check-out, jumlah tamu dewasa dan anak, serta tipe kamar yang Anda minati.',
      },
      {
        q: 'Bagaimana jika tanggal belum pasti?',
        a: 'Tidak masalah. Kami dapat memberi gambaran tipe kamar dan fasilitas lebih dulu.',
      },
      {
        q: 'Apakah bisa menghubungi lewat telepon?',
        a: 'Bisa. Nomor telepon tertera di halaman ini, atau Anda dapat memilih WhatsApp.',
      },
    ] as FaqItem[],
  },
};

export const notFound = {
  title: 'Halaman tidak ditemukan',
  code: '404',
  text: 'Alamat yang Anda tuju tidak tersedia atau sudah dipindahkan. Kembali ke beranda atau lihat pilihan kamar kami.',
  home: 'Kembali ke Beranda',
  rooms: 'Lihat Kamar',
  linksTitle: 'Halaman lain',
};
