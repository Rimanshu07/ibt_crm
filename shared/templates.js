/**
 * Organisation templates (Organisation → Templates). Each organisation can
 * override subject/body/settings; anything not saved falls back to these.
 * Placeholders like {{guest_name}} are filled in when the document is made.
 */
export const PLACEHOLDERS = {
  common: ['org_name', 'org_phone', 'org_email', 'guest_name', 'trip_no', 'destinations', 'start_date', 'end_date', 'nights', 'pax', 'sales_name', 'sales_phone'],
  quote: ['quote_version', 'total_price', 'per_person', 'quote_link'],
  hotel: ['hotel_name', 'checkin', 'checkout', 'rooms_detail', 'meal_plan', 'confirmation_no'],
  activity: ['activity_name', 'activity_date', 'tickets'],
  money: ['amount_due', 'due_date', 'invoice_no'],
};

export const TEMPLATES = [
  {
    key: 'quote_email', label: 'Quote Email', kind: 'email', vars: ['common', 'quote'],
    subject: 'Your {{destinations}} holiday quote – Trip {{trip_no}}',
    body: `Dear {{guest_name}},

Greetings from {{org_name}}!

As discussed, please find your quotation for {{destinations}} ({{nights}} nights, {{pax}}) starting {{start_date}}.

Package price: {{total_price}} ({{per_person}} per person)

The detailed day-wise itinerary, hotels, inclusions and exclusions are attached.
Prices are subject to availability at the time of booking.

Warm regards,
{{sales_name}}
{{org_name}} | {{org_phone}}`,
    settings: { attach_pdf: true },
  },
  {
    key: 'quote_pdf', label: 'Quote PDF', kind: 'document', vars: ['common', 'quote'],
    subject: 'Holiday Quotation',
    body: `Thank you for choosing {{org_name}}. We have put together this itinerary for {{guest_name}}. We look forward to making your trip memorable.`,
    settings: {
      show_cover: true, show_itinerary: true, show_hotels: true, show_service_prices: false, show_per_person: true,
      show_inclusions: true, show_tnc: true, show_bank: true, accent_color: '#2563eb',
    },
  },
  {
    key: 'proforma_invoice', label: 'Proforma Invoice', kind: 'document', vars: ['common', 'money'],
    subject: 'Proforma Invoice',
    body: 'This is a proforma invoice and not a tax invoice. Please make payments only to the bank accounts listed below.',
    settings: { show_bank: true, show_schedule: true, sac_code: '998555', invoice_prefix: 'PI' },
  },
  {
    key: 'trip_voucher', label: 'Trip Voucher', kind: 'document', vars: ['common'],
    subject: 'Travel Voucher',
    body: 'Please carry this voucher and a valid photo ID for every guest. For any help during the trip, call our 24x7 support on {{org_phone}}.',
    settings: { show_emergency: true, show_itinerary: true, show_driver: true },
  },
  {
    key: 'hotel_voucher', label: 'Hotel Voucher', kind: 'document', vars: ['common', 'hotel'],
    subject: 'Hotel Voucher',
    body: 'Please present this voucher at check-in. Early check-in and late check-out are subject to availability.',
    settings: { show_price: false },
  },
  {
    key: 'hotel_booking_email', label: 'Hotel Booking Enquiry Email', kind: 'email', vars: ['common', 'hotel'],
    subject: 'Booking request – {{guest_name}} – {{checkin}} – Trip {{trip_no}}',
    body: `Dear Reservations team,

Please confirm the following booking:

Guest: {{guest_name}} ({{pax}})
Hotel: {{hotel_name}}
Check-in: {{checkin}}   Check-out: {{checkout}}
Rooms: {{rooms_detail}}
Meal plan: {{meal_plan}}

Kindly share the confirmation number and payment details.

Regards,
{{sales_name}}
{{org_name}} | {{org_phone}}`,
    settings: {},
  },
  {
    key: 'activity_voucher_email', label: 'Activity Voucher Email', kind: 'email', vars: ['common', 'activity'],
    subject: 'Activity voucher – {{activity_name}} – {{activity_date}}',
    body: `Dear {{guest_name}},

Your booking for {{activity_name}} on {{activity_date}} ({{tickets}}) is confirmed. Please find the voucher attached.

Regards,
{{org_name}}`,
    settings: {},
  },
  {
    key: 'payment_receipt', label: 'Payment Receipt', kind: 'document', vars: ['common', 'money'],
    subject: 'Payment Receipt',
    body: 'We have received your payment with thanks. This receipt is subject to realisation of the payment.',
    settings: {},
  },
];

export const templateDef = (key) => TEMPLATES.find((t) => t.key === key);

/** Replace {{placeholders}}; unknown ones are left as they are. */
export function fill(text, vars) {
  return String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

/** Starting inclusions/exclusions and T&C created for every new organisation (editable). */
export const DEFAULT_CONTENT = [
  { kind: 'inc_exc', service: 'hotel', title: 'Hotels', inclusions: ['Accommodation in the hotels mentioned or similar', 'Meals as per the meal plan', 'All hotel taxes'], exclusions: ['Early check-in / late check-out', 'Room service, laundry and minibar'] },
  { kind: 'inc_exc', service: 'transport', title: 'Transport', inclusions: ['Private vehicle for transfers and sightseeing as per itinerary', 'Driver allowance, fuel, tolls and parking'], exclusions: ['Vehicle at disposal beyond the itinerary', 'Monument entry fees unless mentioned'] },
  { kind: 'inc_exc', service: 'activity', title: 'Activities', inclusions: ['Tickets for the activities mentioned'], exclusions: ['Camera fees', 'Optional activities'] },
  { kind: 'inc_exc', service: 'land_package', title: 'Land package', inclusions: ['Land services as per the vendor package'], exclusions: ['International / domestic airfare unless mentioned'] },
  { kind: 'inc_exc', service: 'flight', title: 'Flights', inclusions: ['Economy class airfare as mentioned', 'Check-in and cabin baggage as per airline'], exclusions: ['Seat selection and meals unless mentioned', 'Fare increase before ticketing'] },
  { kind: 'inc_exc', service: 'train', title: 'Trains', inclusions: ['Train tickets in the class mentioned'], exclusions: ['Food on board'] },
  { kind: 'inc_exc', service: 'visa', title: 'Visa', inclusions: ['Visa fee and our service charge'], exclusions: ['Courier and photographs', 'Visa approval is at the discretion of the embassy'] },
  { kind: 'inc_exc', service: 'passport', title: 'Passport', inclusions: ['Form filling and appointment booking', 'Government fee as mentioned'], exclusions: ['Travel to the Passport Seva Kendra'] },
  { kind: 'inc_exc', service: 'insurance', title: 'Travel insurance', inclusions: ['Travel insurance as per the plan'], exclusions: ['Pre-existing conditions unless covered by the policy'] },
  { kind: 'inc_exc', service: 'general', title: 'General', inclusions: ['24x7 on-trip support'], exclusions: ['Anything not mentioned in inclusions', 'Personal expenses, tips and porterage'] },
  { kind: 'tnc', service: 'general', title: 'Booking & cancellation', body: `1. 50% advance confirms the booking; balance is due 15 days before travel.
2. Cancellation 30+ days before travel: 25% of package cost. 15–30 days: 50%. Less than 15 days: no refund.
3. Hotel check-in is 12:00 and check-out 11:00 unless stated otherwise.
4. Prices may change due to government taxes or fuel price increases.` },
  { kind: 'tnc', service: 'visa', title: 'Visa terms', body: 'Visa fees are non-refundable once the application is submitted, whether the visa is approved or rejected.' },
];
