/** Buyurtma, manzil va chat turlari */
import type {
  DeliveryType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTerms,
  Role,
  Unit,
} from '@mebel/shared';

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
  canCancel: boolean;
  createdAt: string;
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
