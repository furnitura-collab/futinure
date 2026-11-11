/** Buyurtma, to'lov, chat va yetkazish turlari */
import type {
  CustomerType,
  DeliveryStatus,
  DeliveryType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTerms,
  Role,
  Unit,
} from '@mebel/shared';

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

export interface OrderDetail extends Omit<OrderCard, 'itemsCount' | 'unreadMessages' | 'customer'> {
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
  vehicleType: string | null;
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
  /** Shartlarni faqat yangi (qabul qilinmagan) buyurtmada saqlash mumkin */
  canSetTerms: boolean;
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
