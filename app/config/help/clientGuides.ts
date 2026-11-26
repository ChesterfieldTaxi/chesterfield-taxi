import type { HelpGuide } from './types';

export const CLIENT_GUIDES: HelpGuide[] = [
  {
    id: 'client-booking-saved-places',
    portal: 'client',
    title: 'Booking & Saved Places',
    summary:
      'Schedule airport, local, or corporate rides in seconds and save frequent pickup/dropoff addresses with exact map coordinates.',
    category: 'Passenger & Booking',
    tags: [
      'book',
      'booking',
      'saved places',
      'frequent routes',
      'airport',
      'stl',
      'car seats',
      'luggage',
      'schedule',
    ],
    contextKeys: [
      'client',
      'passenger',
      'passenger:book',
      'passenger:places',
      'corporate:book',
      'client:book',
      'client:places',
    ],
    steps: [
      {
        title: 'Enter pickup, dropoff, and timing on the Book tab',
        description:
          'Open Book (or Book Company Ride in the Corporate Portal), select ASAP or Later, and enter your pickup and destination addresses. For STL Lambert Airport arrivals, include your flight number so dispatch monitors delays automatically.',
      },
      {
        title: 'Choose vehicle tier, passengers, bags, and extras',
        description:
          'Select your vehicle class (such as Standard Sedan, Premium SUV, or XL Minivan) and add passenger count, luggage count, or child car seats (rear-facing infant, forward-facing toddler, or booster).',
      },
      {
        title: 'Save frequent locations in Saved Places',
        description:
          'In the Client Portal, switch to the Places tab (Saved Places & Frequent Routes) to store home, office, hotel, or terminal addresses with exact Places Autocomplete coordinates for 1-tap selection on future bookings.',
        tip: 'Corporate managers can also save shared company offices and campuses under Team, Locations & PO Security in the Corporate Portal.',
      },
    ],
    reference: [
      {
        title: 'Vehicle Capacity & Booking Policies',
        rows: [
          {
            label: 'Standard Sedan',
            description: 'Fits up to 4 passengers with 3 standard suitcases.',
          },
          {
            label: 'SUV / XL Minivan',
            description: 'Fits up to 6 passengers with 6+ large bags; ideal for families and group airport travel.',
          },
          {
            label: 'Flight Monitoring (STL)',
            description: 'Scheduled airport pickups automatically adjust when monitored flights are delayed.',
            badge: 'Included',
            badgeVariant: 'info',
          },
          {
            label: 'Changes & Cancellations',
            description:
              'Modify or cancel online at no charge up to 2 hours before scheduled pickup; call 24/7 Dispatch for last-minute updates.',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can I request child car seats when booking online?',
        answer:
          'Yes. Rear-facing infant, forward-facing toddler, and booster seats can be added directly on the booking form when selecting passengers and luggage.',
      },
      {
        question: 'How do I edit or cancel an upcoming booking?',
        answer:
          'Open the Trips tab in the Client Portal (or Overview & Live Rides in the Corporate Portal) and select your upcoming ride to edit trip details or cancel.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/client/booking-saved-places.png',
        alt: 'Client Portal booking form and Saved Places & Frequent Routes manager',
        caption: '1-tap Saved Places chips above the embedded booking form.',
      },
    ],
  },
  {
    id: 'client-live-tracking',
    portal: 'client',
    title: 'Live Tracking',
    summary:
      'Follow your assigned driver on the live telemetry map, monitor real-time status updates, and view past trip history.',
    category: 'Passenger & Booking',
    tags: [
      'live tracking',
      'track',
      'trips',
      'active ride',
      'en route',
      'arrived',
      'driver',
      'telemetry map',
      'overview',
    ],
    contextKeys: [
      'passenger:trips',
      'passenger:track',
      'corporate',
      'corporate:overview',
      'client:trips',
      'client:tracking',
    ],
    steps: [
      {
        title: 'Watch the Active Ride banner when a driver is assigned',
        description:
          'As soon as your ride is Assigned, Accepted, En Route, Arrived, or In Progress, an Active Ride banner appears at the top of the Client Portal (and under Overview & Live Rides in the Corporate Portal).',
      },
      {
        title: 'Open Track Live on Map',
        description:
          'Tap "Track Live on Map" on the Active Ride card to launch the live telemetry tracker (/track/<token>) showing your vehicle’s location, pickup/dropoff pins, and status progression.',
      },
      {
        title: 'Review upcoming and past rides in Trips',
        description:
          'Open the Trips tab (or use the filter/search controls in Corporate Overview & Live Rides) to review upcoming reservations, rebook frequent routes, or open completed trip receipts.',
        tip: 'On mobile in the Client Portal, touch and hold a trip card for quick ride actions.',
      },
    ],
    reference: [
      {
        title: 'Passenger Ride Statuses',
        rows: [
          {
            label: 'Trip Confirmed',
            description: 'Your reservation is confirmed and scheduled for driver dispatch.',
            badge: 'Scheduled',
            badgeVariant: 'info',
          },
          {
            label: 'Driver assigned to your ride',
            description: 'A dedicated driver and vehicle have been paired with your trip.',
          },
          {
            label: 'Your driver is on the way',
            description: 'Driver is En Route to your pickup address; live map tracking is active.',
            badge: 'En Route',
            badgeVariant: 'primary',
          },
          {
            label: 'Your driver has arrived at pickup!',
            description: 'Driver is on location at your pickup point.',
            badge: 'Arrived',
            badgeVariant: 'warning',
          },
          {
            label: 'Your ride is in progress',
            description: 'You are on board and heading to your destination.',
            badge: 'In Progress',
            badgeVariant: 'success',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can I share a live tracking link with a family member or executive assistant?',
        answer:
          'Yes. The /track link uses a trip-specific tracking token so recipients can follow live ride progress in any browser without needing your account password.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/client/live-tracking.png',
        alt: 'Active Ride banner with Track Live on Map button and live telemetry map',
        caption: 'Active Ride status card linking directly to the live passenger telemetry map.',
      },
    ],
  },
  {
    id: 'client-saved-cards-payments',
    portal: 'client',
    title: 'Saved Cards & Payments',
    summary:
      'Choose in-car terminal, online card, cash, or corporate account billing, save cards securely for recurring travel, and print itemized receipts.',
    category: 'Payments & Receipts',
    tags: [
      'payments',
      'saved cards',
      'card',
      'stripe',
      'apple pay',
      'google pay',
      'cash',
      'receipts',
      'pay in car',
    ],
    contextKeys: ['passenger:payments', 'client:payments'],
    steps: [
      {
        title: 'Select your preferred payment method during booking',
        description:
          'In the Payment section of the booking form, choose Card, Cash, or Corporate Account (when booking on an authorized B2B account).',
      },
      {
        title: 'Choose Pay Driver in Car vs Pay Online by Card',
        description:
          'When paying by Card (and online card processing is enabled), pick "Pay Driver in Car" (tap, chip, Apple Pay, or Google Pay with no upfront charge) or "Pay Online by Card" to enter card details securely.',
      },
      {
        title: 'Save card on file for recurring travel',
        description:
          'When using Pay Online by Card, check "Save card securely on file for recurring travel" to tokenize your card through the payment processor without storing raw card numbers.',
      },
      {
        title: 'View and print itemized receipts',
        description:
          'Open the Trips tab, select any completed ride, and open its receipt to view the fare breakdown, tip amount, payment status (Paid, Authorized, or Corporate Account), and print/PDF view.',
      },
    ],
    reference: [
      {
        title: 'Supported Payment Options',
        rows: [
          {
            label: 'Pay Driver in Car',
            description: 'Tap, chip, swipe, Apple Pay, or Google Pay inside the vehicle. No upfront charge.',
            badge: 'No Upfront Charge',
            badgeVariant: 'success',
          },
          {
            label: 'Pay Online by Card',
            description: 'Encrypted online card checkout with optional card-on-file saving for recurring rides.',
          },
          {
            label: 'Pay Driver in Cash at Dropoff',
            description: 'Pay cash directly to your driver at the conclusion of the trip.',
          },
          {
            label: 'Corporate Account',
            description: 'Bills authorized B2B rides to your company statement (subject to PO verification rules).',
            badge: 'B2B',
            badgeVariant: 'info',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'Why don’t I see "Pay Online by Card" on the booking form?',
        answer:
          'If online card checkout is disabled by the operator, Card bookings default to "Pay Driver in Car (Tap, Chip, or Swipe)" so you can pay securely at the in-vehicle terminal.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/client/saved-cards-payments.png',
        alt: 'Payment method selector showing Pay Driver in Car, Pay Online by Card, and printable receipt',
        caption: 'Selecting in-car vs online card payment and viewing an itemized trip receipt.',
      },
    ],
  },
  {
    id: 'client-corporate-team-cost-centers',
    portal: 'client',
    title: 'Corporate Team & Cost Centers',
    summary:
      'Manage company travelers, department cost centers, authorized booker emails, shared corporate locations, and anti-fraud PO rotation.',
    category: 'Corporate Portal',
    tags: [
      'corporate',
      'team',
      'cost centers',
      'departments',
      'po',
      'po security',
      'rotate po',
      'authorized bookers',
      'travelers',
    ],
    contextKeys: ['corporate:team', 'client:corporate-team'],
    steps: [
      {
        title: 'Open Team, Locations & PO Security',
        description:
          'In the Corporate Travel Portal (/app/corporate), select the "Team, Locations & PO Security" tab.',
      },
      {
        title: 'Manage company riders and VIP travelers',
        description:
          'Add employee or guest traveler profiles with name, email, phone, default Department / Cost Center, and VIP designation so travel coordinators can prefill rides in one click on "Book Company Ride".',
      },
      {
        title: 'Configure Cost Centers & Authorized Bookers',
        description:
          'Under "Cost Centers & Authorized Bookers", add or remove Department / Cost Center codes for statement reconciliation and maintain the list of authorized booker email addresses.',
      },
      {
        title: 'Enforce and rotate your Active PO Number',
        description:
          'When PO Verification is enforced, enter an "Audit Reason for PO Rotation" and click "Rotate Active PO" whenever needed. Rotating immediately revokes the prior code and records it in the "Revoked PO Audit Trail".',
        tip: 'Rotating your PO prevents former employees or unauthorized callers from billing rides to an old PO number.',
      },
    ],
    reference: [
      {
        title: 'Corporate Governance Controls',
        rows: [
          {
            label: 'Current Active PO Number',
            description: 'Required on account-billed bookings whenever PO Verification Enforced is active.',
            badge: 'Security',
            badgeVariant: 'warning',
          },
          {
            label: 'Revoked PO Audit Trail',
            description: 'Immutable log of previously rotated PO codes, timestamps, and rotation reasons.',
          },
          {
            label: 'Department / Cost Center Codes',
            description: 'Standardized tags selectable during booking and shown on itemized statements.',
          },
          {
            label: 'Saved Company Locations',
            description: 'Shared offices, plants, and hotels available to all bookers on the corporate account.',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'What happens if someone tries to book using a rotated (old) PO number?',
        answer:
          'Revoked PO numbers fail PO verification immediately, protecting your corporate account from unauthorized travel charges.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/client/corporate-team-cost-centers.png',
        alt: 'Corporate Portal Team, Locations & PO Security tab showing PO rotation and Cost Centers',
        caption: 'Managing corporate travelers, cost center codes, and anti-fraud PO rotation.',
      },
    ],
  },
  {
    id: 'client-corporate-invoicing-statements',
    portal: 'client',
    title: 'Corporate Invoicing & Statements',
    summary:
      'Review consolidated B2B statements, audit traveler and PO line items, print PDF statements, and remit open balances online in one tap.',
    category: 'Corporate Portal',
    tags: [
      'corporate',
      'invoicing',
      'statements',
      'billing',
      'remittance',
      'pay invoice',
      'overdue',
      'line items',
      'pdf',
    ],
    contextKeys: ['corporate:billing', 'client:corporate-billing'],
    steps: [
      {
        title: 'Open Statements & Billing',
        description:
          'In the Corporate Travel Portal, click the "Statements & Billing" tab (the badge displays your count of open invoices).',
      },
      {
        title: 'Inspect itemized B2B statements',
        description:
          'Click any invoice row to open the "Corporate B2B Statement" modal showing issue/due dates, billing address, traveler names, PO / cost center references, discounts, and total statement balance.',
      },
      {
        title: 'Print or save as PDF',
        description:
          'Use the print action inside the statement modal to print or save a clean formatted PDF copy for your Accounts Payable team.',
      },
      {
        title: 'Remit open or overdue balances online',
        description:
          'Click "Pay Invoice Now" on the statement card (or "Pay Invoice Online" inside the statement modal) to launch 1-tap online remittance for issued or overdue statements.',
      },
    ],
    reference: [
      {
        title: 'Statement Status Indicators',
        rows: [
          {
            label: 'Issued',
            description: 'Statement has been generated and is within its net payment window.',
            badge: 'Open',
            badgeVariant: 'info',
          },
          {
            label: 'Overdue',
            description: 'Statement is past its due date; eligible for immediate Pay Invoice Now remittance.',
            badge: 'Past Due',
            badgeVariant: 'danger',
          },
          {
            label: 'Paid',
            description: 'Remittance has been recorded, displaying the paid date on the statement.',
            badge: 'Settled',
            badgeVariant: 'success',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'Are PO numbers and traveler names shown on each statement line item?',
        answer:
          'Yes. Each ride line item in the Corporate B2B Statement lists the trip date, traveler name, and recorded PO number alongside the fare.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/client/corporate-invoicing-statements.png',
        alt: 'Corporate Portal Statements & Billing list and printable Corporate B2B Statement modal',
        caption: 'Corporate Statements & 1-Tap Online Remittance with printable PDF statement detail.',
      },
    ],
  },
  {
    id: 'client-profile-notifications',
    portal: 'client',
    title: 'Profile & Notifications',
    summary:
      'Update rider contact info, default vehicle tier, permanent pickup/gate-code instructions, SMS/email/call alerts, and Light/Dark appearance.',
    category: 'Account & Preferences',
    tags: [
      'profile',
      'notifications',
      'sms',
      'email receipts',
      'phone call',
      'gate code',
      'preferred vehicle',
      'appearance',
      'dark mode',
    ],
    contextKeys: ['passenger:profile', 'client:profile'],
    steps: [
      {
        title: 'Update contact details & Preferred Vehicle',
        description:
          'Open the Profile tab in the Client Portal to edit your First/Last Name, Mobile Phone (for text updates), Email Address (for receipts), and Preferred Vehicle class.',
      },
      {
        title: 'Save Default Pickup Instructions & Gate Codes',
        description:
          'Enter recurring driver notes (such as gate codes, building entrances, or "please call upon arrival") so they are automatically attached to future bookings.',
      },
      {
        title: 'Customize SMS, receipt, and arrival call Notifications',
        description:
          'Check or uncheck text message updates (driver en route & arrived), automatic email trip receipts, and arrival phone calls, then click "Save Profile & Preferences".',
      },
      {
        title: 'Switch Light, Dark, or System Appearance',
        description:
          'Use the Appearance selector in Profile (or the cycle icon in the Corporate Portal header) to choose Light, Dark, or match your device setting.',
      },
    ],
    reference: [
      {
        title: 'Notification & Preference Controls',
        rows: [
          {
            label: 'Text message updates',
            description: 'Sends automated SMS alerts when your driver is en route and arrives at pickup.',
          },
          {
            label: 'Email me trip receipts automatically',
            description: 'Delivers itemized fare receipts to your profile email upon trip completion.',
          },
          {
            label: 'Phone call when my driver arrives',
            description: 'Requests a direct arrival phone notification at pickup.',
          },
          {
            label: 'Switch Workspace (Multi-Role Staff)',
            description:
              'Accounts with Dispatcher, Driver, Corporate, or Admin roles also see quick workspace links.',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'Does my Appearance (Light / Dark / System) choice sync across sessions?',
        answer:
          'Yes. When signed in, your theme preference is saved to your user profile as well as local device storage.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/client/profile-notifications.png',
        alt: 'Client Portal Profile & Preferences form with Notifications and Appearance controls',
        caption: 'Profile & Preferences screen for driver notes, notification toggles, and Appearance.',
      },
    ],
  },
];
