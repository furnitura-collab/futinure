/** Lug'at bo'limi: rollar va ruxsatlar (super admin belgilaydi) */
export const access = {
  access: {
    title: 'Rollar va ruxsatlar',
    subtitle: "Har rol admin panelda nimani ko'radi va qila oladi",
    open: 'Rollar va ruxsatlar',
    superAdmin: 'Super admin — doim barcha ruxsatlar',
    locked: 'Faqat super admin',
    save: 'Saqlash',
    saved: 'Ruxsatlar saqlandi',
    reset: 'Standartga qaytarish',
    changed: "Saqlanmagan o'zgarishlar bor",
    groups: { orders: 'Buyurtmalar', payments: "To'lovlar", catalog: 'Katalog va ombor', customers: 'Mijozlar', staff: 'Xodimlar' },
    perm: {
      orders: {
        view: { name: "Buyurtmalarni ko'rish", hint: "Ro'yxat, kanban va buyurtma sahifasi" },
        manage: { name: 'Buyurtmalarni boshqarish', hint: 'Qabul qilish shartlari, menejer va haydovchi biriktirish' },
        finance: { name: 'Buyurtma moliyasi', hint: "To'lovlar va mijoz balansi buyurtma sahifasida" },
        chat: { name: 'Mijoz bilan chat', hint: "Buyurtma bo'yicha xabar yozish" },
        override: { name: "Qoidadan chetlab o'tish", hint: "Avans to'lanmasdan qabul qilish (izoh bilan)" },
      },
      payments: {
        manage: { name: "To'lovlarni boshqarish", hint: "Cheklarni tasdiqlash, rad etish, to'lov kiritish" },
        adjust: { name: 'Hisobni tuzatish', hint: 'Hisob daftariga tuzatish yozuvi va pul qaytarish' },
      },
      catalog: {
        view: { name: "Katalogni ko'rish", hint: 'Mahsulotlar, kategoriyalar va brendlar' },
        edit: { name: 'Katalogni tahrirlash', hint: 'Mahsulot, variant, rasm, kategoriya, Excel import/eksport' },
        delete: { name: "Mahsulotni o'chirish", hint: "Mahsulot va variantlarni o'chirish" },
      },
      prices: {
        manage: { name: 'Narxlarni boshqarish', hint: "Narx guruhlari va ommaviy narx o'zgartirish" },
      },
      stock: {
        manage: { name: 'Ombor', hint: 'Qoldiq, kirim va inventarizatsiya' },
      },
      customers: {
        manage: { name: 'Mijozlar', hint: "Mijozlar ro'yxati, profil, akt-sverka, debitorlik" },
      },
      staff: {
        manage: { name: 'Xodimlar va ruxsatlar', hint: "Xodim qo'shish, rol berish, shu jadval" },
      },
    },
  },
} as const;
