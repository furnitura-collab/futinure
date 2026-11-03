/**
 * API javoblarining admin ishlatadigan qismi.
 * Pul — number (so'm), miqdor — string ("12.5"), sana — ISO string.
 */
import type {
  CustomerType,
  DeliveryStatus,
  DeliveryType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTerms,
  QuoteLine,
  QuoteStatus,
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
  locale: 'uz' | 'ru';
}

export interface CustomerBrief {
  id: string;
  phone: string;
  fullName: string | null;
  customerProfile: { type?: CustomerType; companyName: string | null } | null;
}

export interface OrderCard {
  id: string;
  number: string;
  status: OrderStatus;
  version: number;
  deliveryType: DeliveryType;
  grandTotal: number;
  paidTotal: number;
  balanceDue: number;
  paymentTerms: PaymentTerms | null;
  createdAt: string;
  updatedAt: string;
  itemsCount: number;
  unreadMessages: number;
  customer: CustomerBrief;
  manager: { id: string; fullName: string | null } | null;
  currentQuote: { status: QuoteStatus; expiresAt: string } | null;
}

export interface KanbanColumn {
  status: OrderStatus;
  total: number;
  items: OrderCard[];
}

export interface OrderItem {
  id: string;
  variantId: string;
  sku: string;
  nameUz: string;
  nameRu: string;
  unit: Unit;
  attributes: Record<string, string | number>;
  requestedQty: string;
  qty: string;
  unitPrice: number;
  lineTotal: number;
  status: 'ACTIVE' | 'REMOVED';
  replacedItemId: string | null;
  stock: { available: string; reserved: string; onOrder: boolean; isActive: boolean; shortage: boolean } | null;
}

export interface QuoteTotals {
  itemsTotal: number;
  servicesTotal: number;
  deliveryFee: number;
  discountTotal: number;
  grandTotal: number;
}

export interface QuoteView {
  id: string;
  version: number;
  status: QuoteStatus;
  lines: QuoteLine[];
  totals: QuoteTotals;
  paymentTerms: PaymentTerms;
  advanceAmount: number;
  allowedMethods: PaymentMethod[];
  managerNote: string | null;
  customerComment: string | null;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
}

export interface PaymentRow {
  id: string;
  customerId: string;
  orderId: string | null;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  comment: string | null;
  rejectReason: string | null;
  createdAt: string;
  confirmedAt: string | null;
  createdBy: string;
  order: { id: string; number: string; grandTotal: number; paidTotal: number } | null;
  customer?: CustomerBrief;
  receipt?: { id: string; mimeType: string; size: number } | null;
}

export interface OrderDetail extends Omit<OrderCard, 'itemsCount' | 'unreadMessages' | 'currentQuote' | 'customer'> {
  customerId: string;
  managerId: string | null;
  items: OrderItem[];
  itemsTotal: number;
  servicesTotal: number;
  deliveryFee: number;
  discountTotal: number;
  advanceAmount: number;
  allowedMethods: PaymentMethod[];
  dueDate: string | null;
  deliveryDate: string | null;
  customerComment: string | null;
  cancelReason: string | null;
  totalWeightKg: string;
  addressSnapshot: { addressText: string; floor: number | null; lat: number; lng: number; comment: string | null; needsLoaders: boolean } | null;
  pickupWarehouse: { id: string; name: string; addressText: string } | null;
  customer: CustomerBrief & {
    customerProfile: {
      type: CustomerType;
      companyName: string | null;
      inn: string | null;
      creditLimit: number;
      balanceCached: number;
      paymentTermDays: number;
      allowedPaymentMethods: PaymentMethod[];
      priceGroup: { id: string; name: string } | null;
    } | null;
    _count: { orders: number };
  };
  manager: { id: string; fullName: string | null; phone: string } | null;
  quotes: QuoteView[];
  statusHistory: {
    id: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    comment: string | null;
    createdAt: string;
    actor: { id: string; fullName: string | null; role: Role } | null;
  }[];
  payments: PaymentRow[];
  delivery: DeliveryInfo | null;
  creditCheck: { creditLimit: number; balance: number; exposureAfter: number; exceeds: boolean } | null;
  availableTransitions: { to: OrderStatus; requiresComment: boolean }[];
  canQuote: boolean;
  today: string;
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

/** Katalogdan narx so'rash (taklifga tovar qo'shishda) */
export interface ProductSearchResult {
  variantId: string;
  product: {
    id: string;
    nameUz: string;
    unit: Unit;
    minQty: string;
    qtyStep: string;
    variants: { id: string; sku: string; attributes: Record<string, string | number>; price: number; stockLevel: StockLevel }[];
  };
}

export interface DeliveryInfo {
  id: string;
  driverId: string | null;
  driver: { id: string; fullName: string | null; phone: string } | null;
  status: DeliveryStatus;
  scheduledDate: string | null;
  slot: string | null;
  vehicleType: string | null;
  receiverName: string | null;
  deliveredAt: string | null;
  failReason: string | null;
  cashCollected: number | null;
  proofUploadId: string | null;
}

export interface Driver {
  id: string;
  fullName: string | null;
  phone: string;
  _count: { deliveries: number };
}

export interface Manager {
  id: string;
  fullName: string | null;
  phone: string;
  role: Role;
}

// ───────────── Katalog ─────────────

export interface Category {
  id: string;
  parentId: string | null;
  nameUz: string;
  nameRu: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  _count: { products: number; children: number };
}

export interface Brand {
  id: string;
  name: string;
  logoUrl: string | null;
  _count: { products: number };
}

export interface PriceGroup {
  id: string;
  name: string;
  description: string | null;
  _count: { customers: number; prices: number };
}

export interface AdminVariant {
  id: string;
  sku: string;
  attributes: Record<string, string | number>;
  swatchUrl: string | null;
  basePrice: number;
  stockQty: string;
  reservedQty: string;
  availableQty: string;
  lowStockThreshold: string;
  availability: 'IN_STOCK' | 'ON_ORDER' | 'OUT_OF_STOCK';
  onOrder: boolean;
  leadTimeDays: number | null;
  isActive: boolean;
  stockLevel: StockLevel;
  priceTiers: { minQty: string; price: number }[];
  groupPrices: { priceGroupId: string; price: number; priceGroup: { name: string } }[];
}

export interface AdminProduct {
  id: string;
  code: string | null;
  categoryId: string;
  brandId: string | null;
  nameUz: string;
  nameRu: string;
  descriptionUz: string | null;
  descriptionRu: string | null;
  unit: Unit;
  kind: 'GOODS' | 'BOARD' | 'EDGE';
  minQty: string;
  qtyStep: string;
  weightKg: string | null;
  volumeM3: string | null;
  boardLengthMm: number | null;
  boardWidthMm: number | null;
  thicknessMm: string | null;
  isActive: boolean;
  updatedAt: string;
  category: { id: string; nameUz: string };
  brand: { id: string; name: string } | null;
  images: { id: string; url: string; sortOrder: number }[];
  variants: AdminVariant[];
}

export interface StockMovement {
  id: string;
  type: 'IN' | 'OUT' | 'ADJUST' | 'RESERVE' | 'RELEASE';
  qty: string;
  reason: string | null;
  createdAt: string;
  order: { id: string; number: string } | null;
}

export interface LowStockRow {
  variant_id: string;
  sku: string;
  product_id: string;
  name_uz: string;
  unit: Unit;
  stock_qty: string;
  reserved_qty: string;
  available_qty: string;
  low_stock_threshold: string;
  on_order: boolean;
}

export interface ImportIssue {
  row: number;
  column?: string;
  message: string;
}

export interface ImportResult {
  committed: boolean;
  rows: number;
  summary: {
    productsCreated: number;
    productsUpdated: number;
    variantsCreated: number;
    variantsUpdated: number;
    priceChanges: number;
    stockChanges: number;
    brandsCreated: string[];
  };
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

// ───────────── Mijozlar ─────────────

export interface CustomerProfile {
  type: CustomerType;
  companyName: string | null;
  inn: string | null;
  priceGroupId: string | null;
  priceGroup: { id: string; name: string } | null;
  creditLimit: number;
  paymentTermDays: number;
  allowedPaymentMethods: PaymentMethod[];
  balanceCached: number;
}

export interface CustomerRow {
  id: string;
  phone: string;
  fullName: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  customerProfile: CustomerProfile | null;
  _count: { orders: number };
}

export interface CustomerFinance {
  balance: number;
  creditLimit: number;
  availableCredit: number;
  paymentTermDays: number;
  overdueAmount: number;
  pendingPayments: number;
  allowedPaymentMethods: PaymentMethod[];
}

export interface CustomerDetail extends Omit<CustomerRow, '_count'> {
  locale: 'uz' | 'ru';
  addresses: { id: string; label: string | null; addressText: string }[];
  finance: CustomerFinance;
  stats: { orders: number; turnover: number };
  recentOrders: { id: string; number: string; status: OrderStatus; grandTotal: number; paidTotal: number; createdAt: string; dueDate: string | null }[];
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

export interface Reconciliation {
  customer: { id: string; phone: string; fullName: string | null; customerProfile: { companyName: string | null; inn: string | null } | null };
  period: { from: string; to: string };
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  entries: (LedgerEntry & { order: { number: string } | null })[];
}

export interface Receivables {
  totalReceivable: number;
  totalOverdue: number;
  customers: {
    customer_id: string;
    full_name: string | null;
    phone: string;
    company_name: string | null;
    balance: number;
    credit_limit: number;
    overdue: number;
    oldest_due: string | null;
  }[];
}
