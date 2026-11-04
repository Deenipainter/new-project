/**
 * Customer-facing payment methods → Paystack Checkout channels.
 *
 * This is deliberately a thin mapping, not a payment integration. PalmPay is
 * NOT called directly: Paystack supports it as a wallet inside the `bank`
 * channel for Nigerian merchants, so selecting PalmPay here simply restricts
 * Checkout to `["bank"]` and the customer taps Bank → PalmPay.
 *
 * `channels` never comes from the browser. The API resolves the method id
 * against this table and sends the resulting channel list to Paystack itself.
 */

export type PaymentMethodId = "any" | "palmpay" | "card" | "bank_transfer" | "ussd";

export type PaymentMethodDefinition = {
  id: PaymentMethodId;
  label: string;
  description: string;
  /** Paystack `channels` values. Empty = let Paystack show every enabled channel. */
  channels: string[];
};

export const PAYMENT_METHODS: PaymentMethodDefinition[] = [
  {
    id: "any",
    label: "Paystack checkout",
    description: "Whatever your Paystack account has enabled — card, bank, transfer or USSD.",
    channels: [],
  },
  {
    id: "palmpay",
    label: "PalmPay",
    description: "Choose Bank → PalmPay at checkout, then authorise with your PalmPay PIN.",
    channels: ["bank"],
  },
  {
    id: "card",
    label: "Card",
    description: "Verve, Visa or Mastercard debit cards.",
    channels: ["card"],
  },
  {
    id: "bank_transfer",
    label: "Bank transfer",
    description: "Paystack shows account details you can pay from any bank app.",
    channels: ["bank_transfer"],
  },
  {
    id: "ussd",
    label: "USSD",
    description: "Dial the code Paystack shows for your bank — no data needed.",
    channels: ["ussd"],
  },
];

export function isPaymentMethodId(value: unknown): value is PaymentMethodId {
  return typeof value === "string" && PAYMENT_METHODS.some((method) => method.id === value);
}

export function getPaymentMethod(id: PaymentMethodId): PaymentMethodDefinition {
  return PAYMENT_METHODS.find((method) => method.id === id) ?? PAYMENT_METHODS[0];
}

export type PaymentMethodOption = {
  id: PaymentMethodId;
  label: string;
  description: string;
  available: boolean;
  unavailableReason?: string;
};

/**
 * Availability is honest about what we can actually know:
 * - `any` is always offered (Paystack decides what to show).
 * - a channel restricted by PAYSTACK_CHANNELS is hidden.
 * - PalmPay additionally needs the merchant to declare that the Bank channel
 *   really does expose PalmPay, because Paystack has no channel-discovery API.
 */
export function resolvePaymentMethods(input: {
  paymentsReady: boolean;
  declaredChannels: string[];
  palmPayEnabled: boolean;
}): PaymentMethodOption[] {
  return PAYMENT_METHODS.filter((method) => method.id !== "palmpay" || input.paymentsReady).map(
    (method) => {
      if (method.id === "any") {
        return { id: method.id, label: method.label, description: method.description, available: input.paymentsReady };
      }

      const channelAllowed =
        input.declaredChannels.length === 0 ||
        method.channels.some((channel) => input.declaredChannels.includes(channel));

      if (method.id === "palmpay") {
        const available = input.paymentsReady && channelAllowed && input.palmPayEnabled;
        return {
          id: method.id,
          label: method.label,
          description: method.description,
          available,
          unavailableReason: available
            ? undefined
            : !channelAllowed
              ? "The bank channel is disabled for this Paystack account."
              : "PalmPay has not been confirmed for this Paystack account yet. Enable Bank under Settings → Preferences → Payment channels, then set PAYSTACK_PALMPAY_ENABLED=true.",
        };
      }

      return {
        id: method.id,
        label: method.label,
        description: method.description,
        available: input.paymentsReady && channelAllowed,
        unavailableReason: channelAllowed ? undefined : "This channel is not enabled for this Paystack account.",
      };
    },
  );
}
