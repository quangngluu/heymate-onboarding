export const EDITION_REVEAL_MS = 4500; // was inline 12000 in main.ts:1476
export const BRIDGE_TRIGGER_TURNS = 3; // user turns before the physical-form beat
export const PAYMENT_SIM_MS = 2400; // simulated processing dwell

export type PaymentSimPhase = 'idle' | 'method' | 'qr' | 'processing' | 'success';
export type PaymentMethod = 'momo' | 'vnpay' | 'bank-qr';
