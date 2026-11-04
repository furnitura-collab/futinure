import type {
  CustomerType,
  DeliveryStatus,
  DeliveryType,
  Locale,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTerms,
  QuoteLine,
  Role,
  StockLevel,
  Unit,
} from '@mebel/shared';

export type { Paginated } from '@mebel/shared';

export interface Me {
  id: string;
  phone: string;
  fullName: string | null;
  role: Role;
  locale: Locale;
  customerProfile: {
    type: CustomerType;
    companyName: string | null;
    inn: string | null;
    creditLimit: number;
    paymentTermDays: number;
    allowedPaymentMethods: PaymentMethod[];
    balanceCached: number;
    priceGroup: { id: string; name: string } | null;
  } | null;
}

export interface CategoryNode {
  id: string;
  parentId: string | null;
  nameUz: string;
  nameRu: string;
  slug: string;
  imageUrl: string | null;
  /** Faol mahsulotlar soni (ichki kategoriyalar bilan) */
  productCount: number;
  children: CategoryNode[];
}

export interface ProductCard {
  id: string;
  nameUz: string;
  nameRu: string;
  unit: Unit;
  kind: string;
  categoryId: string;
  brand: { id: string; name: string } | null;
  imageUrl: string | null;
  priceFrom: number;
  basePriceFrom: number;
  stockLevel: StockLevel;
  variantCount: number;
  /** Yagona variant bo'lsa — ro'yxatdan to'g'ridan-to'g'ri qo'shish */
  variantId: string | null;
  minQty: string;
  qtyStep: string;
}

export interface BuyAgainItem {
  variantId: string;
  sku: string;
  attributes: Record<string, string | number>;
  lastQty: string;
  lastOrderedAt: string;
  unitPrice: number;
  stockLevel: StockLevel;
  product: ProductCard;
}

export interface ProductDetail {
  id: string;
  nameUz: string;
  nameRu: string;
  descriptionUz: string | null;
  descriptionRu: string | null;
  unit: Unit;
  kind: string;
  minQty: string;
  qtyStep: string;
  weightKg: string | null;
  board: { lengthMm: number; widthMm: number; thicknessMm: string } | null;
  brand: { id: string; name: string } | null;
  category: { id: string; nameUz: string; nameRu: string; slug: string; parentId: string | null };
  images: { id: string; url: string }[];
  variants: {
    id: string;
    sku: string;
    attributes: Record<string, string | number>;
    swatchUrl: string | null;
    basePrice: number;
    price: number;
    groupPrice: number | null;
    tiers: { minQty: string; price: number }[];
    stockLevel: StockLevel;
    leadTimeDays: number | null;
  }[];
}

export type LineIssue = { code: string; available?: string; minQty?: string; qtyStep?: string };

export interface CartLine {
  variantId: string;
  qty: string;
  sku: string | null;
  productId: string | null;
  nameUz: string | null;
  nameRu: string | null;
  unit: Unit | null;
  categoryId: string | null;
  kind: string | null;
  imageUrl: string | null;
  minQty: string | null;
  qtyStep: string | null;
  attributes: Record<string, string | number> | null;
  unitPrice: number;
  basePrice: number;
  lineTotal: number;
  stockLevel: StockLevel | null;
  issues: LineIssue[];
}

export interface Cart {
  lines: CartLine[];
  count: number;
  itemsTotal: number;
  totalWeightKg: number;
  hasIssues: boolean;
  hasBlockingIssues: boolean;
}

export interface Address {
  id: string;
  label: string | null;
  addressText: string;
  lat: number;
  lng: number;
  floor: number | null;
  needsLoaders: boolean;
  comment: string | null;
}

export interface Warehouse {
  id: string;
  name: string;
  addressText: string;
  phone: string | null;
  workHours: string | null;
}

export interface OrderListItem {
  id: string;
  number: string;
  status: OrderStatus;
  deliveryType: DeliveryType;
  grandTotal: number;
  paidTotal: number;
  balanceDue: number;
  /** Hozir to'lanishi kerak summa (0 — to'lov kutilmaydi) */
  amountDue: number;
  paymentTerms: PaymentTerms | null;
  createdAt: string;
  /** Birinchi 3 ta tovar — kartada "nima buyurtma qilingan" */
  preview: { nameUz: string; nameRu: string; qty: string; unit: Unit }[];
  itemsCount: number;
  unreadMessages: number;
  hasPendingQuote: boolean;
}

export interface Quote {
  id: string;
  version: number;
  lines: QuoteLine[];
  totals: { itemsTotal: number; servicesTotal: number; deliveryFee: number; discountTotal: number; grandTotal: number };
  terms: { deliveryDate?: string | null };
  paymentTerms: PaymentTerms;
  advanceAmount: number;
  allowedMethods: PaymentMethod[];
  managerNote: string | null;
  expiresAt: string;
}

export interface OrderDetail {
  id: string;
  number: string;
  status: OrderStatus;
  version: number;
  deliveryType: DeliveryType;
  items: {
    id: string;
    variantId: string;
    sku: string;
    nameUz: string;
    nameRu: string;
    unit: Unit;
    attributes: Record<string, string | number>;
    qty: string;
    requestedQty: string;
    unitPrice: number;
    lineTotal: number;
  }[];
  itemsTotal: number;
  deliveryFee: number;
  discountTotal: number;
  grandTotal: number;
  paidTotal: number;
  balanceDue: number;
  amountDue: number;
  paymentTerms: PaymentTerms | null;
  advanceAmount: number;
  allowedMethods: PaymentMethod[];
  dueDate: string | null;
  deliveryDate: string | null;
  customerComment: string | null;
  cancelReason: string | null;
  addressSnapshot: { addressText: string } | null;
  pickupWarehouse: { name: string; addressText: string; phone: string | null; workHours: string | null } | null;
  statusHistory: { fromStatus: OrderStatus | null; toStatus: OrderStatus; comment: string | null; createdAt: string }[];
  payments: { id: string; amount: number; method: PaymentMethod; status: PaymentStatus; createdAt: string; rejectReason: string | null }[];
  pendingQuote: Quote | null;
  canCancel: boolean;
  createdAt: string;
}

export interface Balance {
  balance: number;
  creditLimit: number;
  availableCredit: number;
  paymentTermDays: number;
  overdueAmount: number;
  pendingPayments: number;
  allowedPaymentMethods: PaymentMethod[];
}

export interface LedgerEntry {
  id: string;
  type: 'DEBIT' | 'CREDIT' | 'ADJUSTMENT' | 'REFUND';
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
  order: { id: string; number: string } | null;
}

export interface ChatMessage {
  id: string;
  orderId: string;
  text: string | null;
  createdAt: string;
  readByCustomerAt: string | null;
  readByStaffAt: string | null;
  sender: { id: string; fullName: string | null; role: Role };
  attachment: { id: string; mimeType: string; size: number } | null;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: { orderId?: string; quoteId?: string; paymentId?: string };
  readAt: string | null;
  createdAt: string;
}

export interface PaymentInfo {
  card: { number: string; holder: string } | null;
  bank: { name: string; account: string; mfo: string; inn: string } | null;
}

/** Haydovchi ilovasi: yetkazish (narxlarsiz, faqat olinadigan summa) */
export interface DriverDelivery {
  id: string;
  orderId: string;
  status: DeliveryStatus;
  scheduledDate: string | null;
  slot: string | null;
  vehicleType: string | null;
  receiverName: string | null;
  deliveredAt: string | null;
  failReason: string | null;
  cashCollected: number | null;
  proofUploadId: string | null;
  order: {
    id: string;
    number: string;
    status: OrderStatus;
    version: number;
    addressSnapshot: Omit<Address, 'id'> | null;
    deliveryDate: string | null;
    totalWeightKg: string;
    paymentTerms: PaymentTerms | null;
    customerComment: string | null;
    customer: { fullName: string | null; phone: string; customerProfile: { companyName: string | null } | null };
    itemsCount: number;
    toCollect: number;
    items?: { id: string; sku: string; nameUz: string; nameRu: string; unit: Unit; qty: string; attributes: Record<string, string> }[];
  };
}

export interface DriverList {
  today: string;
  active: DriverDelivery[];
  done: DriverDelivery[];
}
