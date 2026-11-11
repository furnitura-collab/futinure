import type {
  DeliveryStatus,
  OrderStatus,
  PaymentTerms,
  Unit,
} from '@mebel/shared';
import type { Address } from './orders';

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
