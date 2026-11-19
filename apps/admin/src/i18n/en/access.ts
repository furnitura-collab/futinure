import type { Dictionary } from '../types';

export const access: Pick<Dictionary, 'access'> = {
  access: {
    title: 'Roles & permissions',
    subtitle: 'What each role can see and do in the admin panel',
    open: 'Roles & permissions',
    superAdmin: 'Super admin — always every permission',
    locked: 'Super admin only',
    save: 'Save',
    saved: 'Permissions saved',
    reset: 'Reset to defaults',
    changed: 'You have unsaved changes',
    groups: { orders: 'Orders', payments: 'Payments', catalog: 'Catalog & stock', customers: 'Customers', staff: 'Staff' },
    perm: {
      orders: {
        view: { name: 'View orders', hint: 'List, board and order page' },
        manage: { name: 'Manage orders', hint: 'Acceptance terms, manager and driver assignment' },
        finance: { name: 'Order finances', hint: "Payments and the customer's balance on the order page" },
        chat: { name: 'Customer chat', hint: 'Messaging about an order' },
        override: { name: 'Override rules', hint: 'Accept without the advance paid (with a comment)' },
      },
      payments: {
        manage: { name: 'Manage payments', hint: 'Confirm, reject and record payments' },
        adjust: { name: 'Account adjustments', hint: 'Ledger adjustments and refunds' },
      },
      catalog: {
        view: { name: 'View catalog', hint: 'Products, categories and brands' },
        edit: { name: 'Edit catalog', hint: 'Products, variants, images, categories, Excel import/export' },
        delete: { name: 'Delete products', hint: 'Delete products and variants' },
      },
      prices: {
        manage: { name: 'Manage prices', hint: 'Price groups and bulk price changes' },
      },
      stock: {
        manage: { name: 'Stock', hint: 'Stock levels, receipts and stocktaking' },
      },
      customers: {
        manage: { name: 'Customers', hint: 'Customer list, profile, reconciliation, receivables' },
      },
      staff: {
        manage: { name: 'Staff & permissions', hint: 'Add staff, assign roles, this table' },
      },
    },
  },
};
