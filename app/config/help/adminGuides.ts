import type { HelpGuide } from './types';

export const ADMIN_GUIDES: HelpGuide[] = [
  {
    id: 'admin-dashboard-analytics',
    portal: 'admin',
    title: 'Dashboard & Analytics',
    summary:
      'Monitor live operational KPIs, SLA on-time performance, revenue trends, and platform health from the Admin Console landing workspace.',
    category: 'Operations',
    tags: ['dashboard', 'analytics', 'sla', 'revenue', 'telemetry', 'system health', 'overview', 'maintenance'],
    contextKeys: [
      'admin',
      'admin:dashboard',
      'admin:dashboard:overview',
      'admin:dashboard:analytics',
      'admin:dashboard:telemetry',
    ],
    steps: [
      {
        title: 'Review daily KPIs on Overview',
        description:
          'Open Dashboard → Overview to inspect active ride counts, completed trips, revenue summaries, and attention items requiring operator action.',
      },
      {
        title: 'Inspect SLA & revenue performance',
        description:
          'Switch to the Analytics & SLA sub-tab to review pickup punctuality, completion rates, and booking channel breakdowns across your selected period.',
      },
      {
        title: 'Verify live connectivity in System Health',
        description:
          'Open Dashboard → System Health (or click the top-right Site Availability & System Status sliders icon) to check Firebase cloud sync status and toggle Maintenance Mode.',
        tip: 'When Maintenance ON is displayed in the top header, public visitors see the construction screen until Maintenance Mode is turned off.',
      },
    ],
    reference: [
      {
        title: 'Dashboard Sub-Pages & Header Controls',
        rows: [
          {
            label: 'Overview',
            description: 'Executive summary cards, active queue snapshot, and daily operational totals.',
            badge: 'Default',
            badgeVariant: 'info',
          },
          {
            label: 'Analytics & SLA',
            description: 'On-time pickup SLA metrics, trip volume trends, and fare revenue charts.',
          },
          {
            label: 'System Health',
            description: 'Service telemetry, integration readiness indicators, and environment diagnostics.',
          },
          {
            label: 'Launch Dispatch',
            description: 'Header button that opens the live 3-pane Dispatch Console (/app/dispatch).',
            badge: 'Shortcut',
            badgeVariant: 'primary',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'Why do I see a "Maintenance ON" pill in the Admin header?',
        answer:
          'Construction / Maintenance Mode is currently enabled in settings. Click the Maintenance ON pill or the top-right sliders button to open Site Controls and switch the public site live.',
      },
      {
        question: 'How do I switch between Light, Dark, and System appearance?',
        answer:
          'Click the sun/moon/monitor Appearance button in the top-right Admin header to cycle between Light, Dark, and System theme preferences.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/admin/dashboard-analytics.png',
        alt: 'Admin Dashboard Overview, Analytics & SLA, and System Health sub-tabs',
        caption: 'Dashboard workspace showing Overview, Analytics & SLA, and System Health navigation.',
      },
    ],
  },
  {
    id: 'admin-trips-audit',
    portal: 'admin',
    title: 'Trips & Audit',
    summary:
      'Oversee the active dispatch queue, recurring standing orders, passenger edit exceptions, and historical trip audit logs.',
    category: 'Operations',
    tags: ['trips', 'active queue', 'standing orders', 'exceptions', 'rider edits', 'trip history', 'audit'],
    contextKeys: [
      'admin:trips',
      'admin:trips:dispatch',
      'admin:trips:standing-orders',
      'admin:trips:exceptions',
      'admin:trips:history',
      'admin:bookings',
    ],
    steps: [
      {
        title: 'Monitor current rides in Active Queue',
        description:
          'Navigate to Trips → Active Queue to inspect upcoming, unconfirmed, and in-progress rides without leaving the Admin Console.',
      },
      {
        title: 'Manage recurring schedules in Standing Orders',
        description:
          'Select Trips → Standing Orders to create, pause, or edit recurring ride series and inspect generated trip instances.',
      },
      {
        title: 'Resolve Exceptions & Rider Edits',
        description:
          'Open Trips → Exceptions & Rider Edits to review passenger-requested trip modifications, cancellations, or flagged rides requiring supervisor sign-off.',
      },
      {
        title: 'Audit past rides in Trip History',
        description:
          'Switch to Trips → Trip History to search completed or cancelled bookings, inspect fare breakdowns, and review status change timestamps.',
      },
    ],
    reference: [
      {
        title: 'Trips Module Sub-Pages',
        rows: [
          {
            label: 'Active Queue',
            description: 'Live view of current and scheduled trips awaiting confirmation, assignment, or completion.',
          },
          {
            label: 'Standing Orders',
            description: 'Recurring passenger and corporate ride templates with automated horizon generation.',
          },
          {
            label: 'Exceptions & Rider Edits',
            description: 'Queue of rider-initiated route/time updates and operational exceptions.',
            badge: 'Triage',
            badgeVariant: 'warning',
          },
          {
            label: 'Trip History',
            description: 'Searchable archive of completed, cancelled, and declined trips with full pricing details.',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'Where did archived trips go?',
        answer:
          'Soft-deleted or archived records are managed centrally under System & Governance → Universal Archive (filtered to Trips).',
      },
    ],
    screenshots: [
      {
        src: '/images/help/admin/trips-audit.png',
        alt: 'Admin Trips sub-pages including Active Queue, Standing Orders, Exceptions, and Trip History',
        caption: 'Trips module sub-navigation for queue oversight, standing orders, exceptions, and history.',
      },
    ],
  },
  {
    id: 'admin-rules-auto-dispatch',
    portal: 'admin',
    title: 'Rules & Auto-Dispatch',
    summary:
      'Configure Auto-Pilot dispatch modes, pre-pickup lead windows, booking intake rules, conflict guard thresholds, and standing order defaults.',
    category: 'Operations',
    tags: [
      'automation',
      'rules',
      'auto-dispatch',
      'auto-pilot',
      'lead windows',
      'intake rules',
      'conflict guard',
      'standing order defaults',
    ],
    contextKeys: [
      'admin:automation',
      'admin:automation:auto-dispatch',
      'admin:automation:intake-rules',
      'admin:automation:console',
      'admin:automation:standing-defaults',
      'admin:rules',
    ],
    steps: [
      {
        title: 'Set Auto-Pilot mode and lead windows',
        description:
          'Go to Dispatch & Automation → Auto-Pilot & Lead Windows to choose manual 1-tap vs automated dispatch, configure scheduled pickup lead minutes, airport extra lead minutes, and staged driver auto-release.',
      },
      {
        title: 'Define Booking Intake Rules',
        description:
          'Open Booking Intake Rules to set minimum advance notice, auto-confirmation policies, and web/portal booking constraints.',
      },
      {
        title: 'Tune Console & Conflict Guard behavior',
        description:
          'Select Console & Conflict Guard to configure overlap warnings, late-driver thresholds, default queue status filters, and real-time routing behavior.',
      },
      {
        title: 'Standardize Standing Order Defaults',
        description:
          'Use Standing Order Defaults to set default generation horizons and staging behavior for recurring ride series.',
      },
    ],
    reference: [
      {
        title: 'Dispatch & Automation Sub-Pages',
        rows: [
          {
            label: 'Auto-Pilot & Lead Windows',
            description: 'Controls dispatch automation mode, pre-pickup release timing, and airport lead buffers.',
            badge: 'Automation',
            badgeVariant: 'success',
          },
          {
            label: 'Booking Intake Rules',
            description: 'Governs minimum notice windows, unconfirmed review triggers, and intake validation.',
          },
          {
            label: 'Console & Conflict Guard',
            description: 'Sets dispatcher queue defaults, schedule overlap alerts, and SLA cascade rules.',
          },
          {
            label: 'Standing Order Defaults',
            description: 'Defines default recurrence horizons and driver staging preferences.',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can dispatchers pause Auto-Pilot or adjust lead windows during a rush?',
        answer:
          'Yes, if permitted under Drivers & Staff → Role & Lead-Window Access, operators can pause/resume Auto-Pilot directly from the Dispatch Console header.',
      },
      {
        question: 'When do changes on Dispatch & Automation take effect?',
        answer:
          'Click Save Changes in the Admin sticky save bar (when shown) to persist updated automation settings to your live workspace.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/admin/rules-auto-dispatch.png',
        alt: 'Dispatch & Automation settings showing Auto-Pilot & Lead Windows and Conflict Guard',
        caption: 'Dispatch & Automation configuration for Auto-Pilot lead windows and conflict guards.',
      },
    ],
  },
  {
    id: 'admin-invoicing-corporate',
    portal: 'admin',
    title: 'Invoicing & Corporate',
    summary:
      'Manage the passenger directory, B2B corporate accounts, PO policies, AR invoices, driver/staff payouts, and QuickBooks accounting sync.',
    category: 'Clients & Billing',
    tags: [
      'invoicing',
      'corporate',
      'customers',
      'passengers',
      'billing',
      'ar ledger',
      'payouts',
      'quickbooks',
      'po',
      'statements',
    ],
    contextKeys: [
      'admin:invoicing',
      'admin:invoicing:ledger',
      'admin:invoicing:accounts',
      'admin:invoicing:payouts',
      'admin:invoicing:accounting-sync',
      'admin:financials',
      'admin:customers',
      'admin:customers:directory',
      'admin:customers:corporate',
    ],
    steps: [
      {
        title: 'Maintain Passenger & Corporate Directories',
        description:
          'Open Clients & Corporate → Passengers or Corporate Directory to add VIP notes, create B2B corporate accounts, assign account numbers, and configure authorized bookers or PO enforcement.',
      },
      {
        title: 'Generate and track B2B statements',
        description:
          'Navigate to Billing & Payouts → Invoices & AR Ledger (or Corporate Billing) to issue statements, monitor open/overdue balances, and send online payment links.',
      },
      {
        title: 'Process Driver, Staff & Other Payouts',
        description:
          'Select Billing & Payouts → Driver, Staff & Other Payouts to review settlement batches, commissions, tips, and reimbursements.',
      },
      {
        title: 'Configure Billing Policy & QuickBooks',
        description:
          'Open Policy & QuickBooks to set net payment terms, billing cadence, and accounting export/sync mappings.',
      },
    ],
    reference: [
      {
        title: 'Clients, Billing & Payouts Sub-Pages',
        rows: [
          {
            label: 'Clients & Corporate → Passengers',
            description: 'Individual rider profiles, contact history, saved notes, and VIP flags.',
          },
          {
            label: 'Clients & Corporate → Corporate Directory',
            description: 'B2B client organizations, PO requirements, cost centers, and portal access.',
          },
          {
            label: 'Billing & Payouts → Invoices & AR Ledger',
            description: 'Issued, paid, and overdue invoices with statement previews and pay-link status.',
          },
          {
            label: 'Billing & Payouts → Corporate Billing',
            description: 'Unbilled corporate account trips ready to consolidate into periodic statements.',
          },
          {
            label: 'Billing & Payouts → Driver, Staff & Other Payouts',
            description: 'Operator earnings settlements and non-trip payout records.',
          },
          {
            label: 'Billing & Payouts → Policy & QuickBooks',
            description: 'Invoice numbering, net terms, and QuickBooks synchronization settings.',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'How can I preview what a corporate travel manager sees in their portal?',
        answer:
          'Open the Corporate Portal (/app/corporate) while signed in as an Admin and use the Admin Preview selector in the top header to switch between corporate accounts.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/admin/invoicing-corporate.png',
        alt: 'Billing & Payouts and Corporate Directory management screens',
        caption: 'Invoices & AR Ledger alongside Corporate Billing and Payout controls.',
      },
    ],
  },
  {
    id: 'admin-rates-tariffs',
    portal: 'admin',
    title: 'Rates & Tariffs',
    summary:
      'Configure base distance/time tariffs, wait-time & extra item fees, conditional surcharges, custom pricing rules, and audit fare changes.',
    category: 'Fleet & Pricing',
    tags: ['rates', 'pricing', 'tariffs', 'extras', 'wait time', 'surcharges', 'pricing rules', 'pricing audit log'],
    contextKeys: [
      'admin:rates',
      'admin:rates:rates',
      'admin:rates:extras',
      'admin:rates:surcharges',
      'admin:rates:rules',
      'admin:rates:audit',
      'admin:pricing',
    ],
    steps: [
      {
        title: 'Edit base distance and minimum fares in Tariffs',
        description:
          'Go to Rates & Pricing → Tariffs to configure flag drop / base fare, per-mile and per-minute rates, step increments, and minimum trip totals.',
      },
      {
        title: 'Configure Extras & Wait fees',
        description:
          'Open Extras & Wait to set prices for add-ons (such as child car seats, extra bags, or meet-and-greet) and per-minute driver waiting rates.',
      },
      {
        title: 'Add peak, holiday, or airport Surcharges',
        description:
          'Use Surcharges and Pricing Rules to apply time-of-day, date-specific, or zone-to-zone flat overrides and multipliers.',
      },
      {
        title: 'Verify historical edits in Pricing Audit Log',
        description:
          'Open Pricing Audit Log to review who modified tariffs, surcharges, or rules and when each pricing revision was saved.',
      },
    ],
    reference: [
      {
        title: 'Rates & Pricing Sub-Pages',
        rows: [
          { label: 'Tariffs', description: 'Core meter/distance base rates, step increments, and minimum fares.' },
          { label: 'Extras & Wait', description: 'Optional passenger extras (car seats, luggage) and wait-time fees.' },
          { label: 'Surcharges', description: 'Airport fees, late-night surcharges, and holiday adjustments.' },
          { label: 'Pricing Rules', description: 'Named route, zone, or corporate flat-rate and multiplier rules.' },
          { label: 'Pricing Audit Log', description: 'Chronological change log for fare and rule updates.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Do tariff edits change the price of already-booked trips?',
        answer:
          'Existing trips keep their locked/quoted pricing unless a dispatcher explicitly recalculates the fare while editing the trip.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/admin/rates-tariffs.png',
        alt: 'Rates & Pricing workspace showing Tariffs, Extras & Wait, Surcharges, and Pricing Rules',
        caption: 'Tariffs, surcharges, and named pricing rules editor in Rates & Pricing.',
      },
    ],
  },
  {
    id: 'admin-vehicles-fleet',
    portal: 'admin',
    title: 'Vehicles & Fleet',
    summary:
      'Define bookable vehicle classes (passenger/luggage capacities and multipliers) and maintain your physical company fleet roster.',
    category: 'Fleet & Pricing',
    tags: ['vehicles', 'fleet', 'cars', 'vehicle types', 'sedan', 'suv', 'minivan', 'capacity'],
    contextKeys: ['admin:vehicles', 'admin:vehicles:types', 'admin:vehicles:fleet', 'admin:fleet'],
    steps: [
      {
        title: 'Configure bookable classes in Vehicle Types',
        description:
          'Open Vehicles → Vehicle Types to manage customer-facing tiers (e.g., Standard Sedan, Premium SUV, XL Minivan), max passenger and bag capacities, and tier pricing adjustments.',
      },
      {
        title: 'Register physical units in Cars',
        description:
          'Switch to Vehicles → Cars to add or update physical company vehicles, unit numbers, license plates, make/model/color, and assigned vehicle class.',
      },
      {
        title: 'Save configuration updates',
        description:
          'Save your changes so updated vehicle tiers appear immediately in the web booking form, Client Portal, and Dispatch Console.',
      },
    ],
    reference: [
      {
        title: 'Vehicles Sub-Pages',
        rows: [
          {
            label: 'Vehicle Types',
            description: 'Customer-selectable vehicle classes, seat/luggage limits, and rate multipliers.',
          },
          {
            label: 'Cars',
            description: 'Physical fleet inventory (unit numbers, plates, VIN/details, and active status).',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'How do I remove a retired vehicle class without breaking past trip records?',
        answer:
          'Archive the vehicle rather than deleting historical references; archived tiers are hidden from new bookings in the Client Portal while preserving past trip receipts.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/admin/vehicles-fleet.png',
        alt: 'Vehicles module showing Vehicle Types and Cars tabs',
        caption: 'Managing bookable Vehicle Types and physical company Cars.',
      },
    ],
  },
  {
    id: 'admin-zones-places',
    portal: 'admin',
    title: 'Zones & Places',
    summary:
      'Draw polygon service zones, curate common pickup/dropoff landmarks, group regions for pricing, and enforce geographic exclusions.',
    category: 'Fleet & Pricing',
    tags: ['zones', 'service zones', 'places', 'landmarks', 'airport', 'groups', 'exclusions', 'blacklists', 'geofence'],
    contextKeys: [
      'admin:zones',
      'admin:zones:zones',
      'admin:zones:places',
      'admin:zones:groups',
      'admin:zones:blacklists',
    ],
    steps: [
      {
        title: 'Create or edit geofences in Zones',
        description:
          'Go to Service Zones → Zones to draw or edit polygon boundaries used for dispatch coverage, zone-to-zone pricing, and driver staging.',
      },
      {
        title: 'Curate quick-pick landmarks in Places',
        description:
          'Open Places to manage named hubs (such as STL Lambert Airport terminals, hotels, hospitals, and corporate campuses) for fast autocomplete in Dispatch and booking forms.',
      },
      {
        title: 'Bundle regions in Groups',
        description:
          'Use Groups to combine adjacent zones into macro regions that can be referenced by a single Pricing Rule.',
      },
      {
        title: 'Block unsupported areas in Exclusions',
        description:
          'Open Exclusions to define restricted zones or out-of-area rules where automated online intake should be declined or flagged.',
      },
    ],
    reference: [
      {
        title: 'Service Zones Sub-Pages',
        rows: [
          { label: 'Zones', description: 'Polygon geofences representing cities, neighborhoods, or airport corridors.' },
          { label: 'Places', description: 'Named POI landmarks and pickup staging points with exact coordinates.' },
          { label: 'Groups', description: 'Collections of zones shared across flat-rate or surcharge rules.' },
          { label: 'Exclusions', description: 'Blacklisted or restricted geographic areas blocked from standard intake.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Where do curated Places appear?',
        answer:
          'Curated Places surface in Dispatch location inputs and map overlays so dispatchers can select exact terminal or campus pins in one click.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/admin/zones-places.png',
        alt: 'Service Zones map editor with Zones, Places, Groups, and Exclusions tabs',
        caption: 'Polygon geofence editor and curated Places directory in Service Zones.',
      },
    ],
  },
  {
    id: 'admin-operators-drivers',
    portal: 'admin',
    title: 'Operators & Drivers',
    summary:
      'Manage the driver and dispatcher roster, workspace role permissions, Driver App shift/meter policies, and driver onboarding applications.',
    category: 'Fleet & Pricing',
    tags: ['operators', 'drivers', 'staff', 'roster', 'permissions', 'driver policies', 'applications', 'onboarding'],
    contextKeys: [
      'admin:operators',
      'admin:operators:roster',
      'admin:operators:permissions',
      'admin:operators:driver-policies',
      'admin:operators:onboarding',
      'admin:staff',
    ],
    steps: [
      {
        title: 'Add or update personnel in Roster',
        description:
          'Navigate to Drivers & Staff → Roster to create or edit driver and dispatcher profiles, contact numbers, callsigns, assigned vehicles, and active status.',
      },
      {
        title: 'Configure Role & Lead-Window Access',
        description:
          'Open Role & Lead-Window Access to control which staff roles can edit pre-pickup lead windows, override staged drivers, or access administrative modules.',
      },
      {
        title: 'Set Driver App Policies',
        description:
          'Select Driver App Policies to configure offer countdown timers, shift check-in requirements, live taximeter options, and driver-facing rules.',
      },
      {
        title: 'Review prospective drivers in Applications',
        description:
          'Open Applications to review submitted driver onboarding records, verify documents, and approve candidates into the active Roster.',
      },
    ],
    reference: [
      {
        title: 'Drivers & Staff Sub-Pages',
        rows: [
          { label: 'Roster', description: 'Active and inactive drivers, dispatchers, and staff accounts.' },
          {
            label: 'Role & Lead-Window Access',
            description: 'Granular operational permissions for dispatchers and supervisors.',
          },
          {
            label: 'Driver App Policies',
            description: 'Offer cascade timers, shift controls, and mobile driver app behavior.',
          },
          {
            label: 'Applications',
            description: 'Inbound driver recruitment and onboarding review queue.',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can one user account hold both Dispatcher and Driver roles?',
        answer:
          'Yes. Multi-role accounts see the Workspace Switcher in portal headers so they can switch between Dispatch, Driver App, Corporate, or Admin views according to their assigned roles.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/admin/operators-drivers.png',
        alt: 'Drivers & Staff roster, permissions, and Driver App policy tabs',
        caption: 'Drivers & Staff module for roster management, role access, and Driver App policies.',
      },
    ],
  },
  {
    id: 'admin-website-cms',
    portal: 'admin',
    title: 'Website/CMS',
    summary:
      'Customize public website themes and dark-mode tokens, configure the online booking & /track experience, manage local SEO service areas, and edit CMS pages.',
    category: 'Website & System',
    tags: [
      'website',
      'cms',
      'branding',
      'themes',
      'seo',
      'service areas',
      'pages',
      'page sections',
      'header',
      'footer',
      'custom css',
      'booking form',
      'track',
    ],
    contextKeys: [
      'admin:website',
      'admin:website:themes',
      'admin:website:form',
      'admin:website:seo',
      'admin:website:pages',
      'admin:website:layout',
      'admin:website:navigation',
      'admin:website:css',
      'admin:form',
      'admin:layout',
    ],
    steps: [
      {
        title: 'Select a brand palette in Themes & Branding',
        description:
          'Open Website, Brand & SEO → Themes & Branding to choose a preset or customize primary/secondary colors, typography, button radius, logo URL, and dark-mode tokens.',
      },
      {
        title: 'Configure Booking & /track options',
        description:
          'Select Booking & /track to customize public booking form steps, field requirements, and live passenger tracking (/track) display options.',
      },
      {
        title: 'Publish local landing pages in Service Areas & SEO',
        description:
          'Use Service Areas & SEO to manage city and airport corridor pages (e.g., Chesterfield to STL Airport), meta titles, descriptions, and structured local SEO copy.',
      },
      {
        title: 'Edit Pages, Page Sections, Header & Footer, or Custom CSS',
        description:
          'Use Pages and Page Sections to arrange homepage/marketing blocks, Header & Footer to update navigation links, and Custom CSS for advanced style overrides.',
      },
    ],
    reference: [
      {
        title: 'Website, Brand & SEO Sub-Pages',
        rows: [
          { label: 'Themes & Branding', description: 'Brand colors, fonts, logos, presets, and dark-mode tokens.' },
          { label: 'Booking & /track', description: 'Public booking widget fields and live ride tracker configuration.' },
          { label: 'Service Areas & SEO', description: 'Local corridor landing pages and search metadata.' },
          { label: 'Pages & Page Sections', description: 'CMS page content and modular section layout order.' },
          { label: 'Header & Footer', description: 'Public navbar links, CTAs, and footer contact/legal links.' },
          { label: 'Custom CSS', description: 'Optional stylesheet overrides applied to public pages.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How do I preview my website changes on the public site?',
        answer:
          'Save your changes and click the Live Site button in the top-right Admin header to open the public customer site in a new browser tab.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/admin/website-cms.png',
        alt: 'Website, Brand & SEO studio showing Themes & Branding, Booking & /track, and SEO tabs',
        caption: 'Website, Brand & SEO studio for themes, booking form configuration, and CMS pages.',
      },
    ],
  },
  {
    id: 'admin-general-branding',
    portal: 'admin',
    title: 'General & Branding',
    summary:
      'Set core company identity, dispatch phone numbers, operating hours, time format, distance units, and regional defaults.',
    category: 'Website & System',
    tags: ['general', 'company info', 'operating hours', 'units', 'time format', 'timezone', 'regional', 'branding'],
    contextKeys: ['admin:general', 'admin:general:profile', 'admin:general:units'],
    steps: [
      {
        title: 'Update Company Info & Hours',
        description:
          'Go to General → Company Info & Hours to set your legal/display company name, primary dispatch phone, support email, headquarters address, and operating schedule.',
      },
      {
        title: 'Configure Time, Units & Regional defaults',
        description:
          'Switch to General → Time, Units & Regional to choose 12-hour vs 24-hour clocks, miles vs kilometers, currency formatting, and default service timezone.',
      },
      {
        title: 'Adjust visual branding in Themes & Branding',
        description:
          'For visual brand colors, fonts, and logos, navigate to Website, Brand & SEO → Themes & Branding.',
        tip: 'Legacy bookmarks to General → Studio automatically redirect to Website, Brand & SEO → Themes & Branding.',
      },
    ],
    reference: [
      {
        title: 'General Sub-Pages',
        rows: [
          {
            label: 'Company Info & Hours',
            description: 'Company name, dispatch hotline, support email, HQ address, and business hours.',
          },
          {
            label: 'Time, Units & Regional',
            description: 'Clock display format, distance units (mi/km), currency, and regional localization.',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'Where does the primary dispatch phone number appear?',
        answer:
          'Updating Company Info & Hours updates the 24/7 dispatch hotline shown across the public site, Client Portal assistance sheet, Corporate Portal header, and trip receipts.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/admin/general-branding.png',
        alt: 'Admin General settings showing Company Info & Hours and Time, Units & Regional',
        caption: 'General module for company contact details, hours, and regional unit settings.',
      },
    ],
  },
  {
    id: 'admin-advanced-integrations',
    portal: 'admin',
    title: 'Advanced & Integrations',
    summary:
      'Connect Stripe/Square payments, Twilio voice & SMS, dispatch email, flight tracking, and webhooks, and govern access roles, audit logs, archives, and maintenance.',
    category: 'Website & System',
    tags: [
      'integrations',
      'advanced',
      'payments',
      'stripe',
      'square',
      'twilio',
      'telephony',
      'sms',
      'dispatch email',
      'flights',
      'webhooks',
      'security',
      'access',
      'roles',
      'activity log',
      'universal archive',
      'maintenance',
    ],
    contextKeys: [
      'admin:integrations',
      'admin:integrations:gateways',
      'admin:integrations:telephony',
      'admin:integrations:email',
      'admin:integrations:flights',
      'admin:integrations:webhooks',
      'admin:advanced',
      'admin:advanced:security',
      'admin:advanced:audit',
      'admin:advanced:archive',
      'admin:advanced:system',
      'admin:archive',
    ],
    steps: [
      {
        title: 'Configure payment gateways and Comms providers',
        description:
          'Open Comms & Integrations to configure Payments (Stripe / Square), Phone, SMS & Templates (Twilio voice softphone and automated SMS notifications), Dispatch Email, Flight Tracking, and Push & Webhooks.',
      },
      {
        title: 'Manage Access & Roles',
        description:
          'Go to System & Governance → Access & Roles to audit administrative accounts, assign role claims, and enforce workspace security boundaries.',
      },
      {
        title: 'Inspect the Activity Log and Universal Archive',
        description:
          'Use Activity Log to trace administrative configuration edits, and Universal Archive to filter, restore, or permanently review archived trips, clients, vehicles, and rates.',
      },
      {
        title: 'Run Maintenance utilities',
        description:
          'Open System & Governance → Maintenance for construction mode controls, cache/config diagnostics, and platform housekeeping.',
      },
    ],
    reference: [
      {
        title: 'Comms & Integrations + System & Governance Sub-Pages',
        rows: [
          { label: 'Comms & Integrations → Payments', description: 'Card processor selection (Stripe / Square) and capture rules.' },
          { label: 'Comms & Integrations → Phone, SMS & Templates', description: 'Twilio softphone numbers, SMS routing, and rider message templates.' },
          { label: 'Comms & Integrations → Dispatch Email', description: 'Inbound/outbound dispatch inbox settings and email signatures.' },
          { label: 'Comms & Integrations → Flight Tracking & Webhooks', description: 'Live airline arrival monitoring and outbound event webhooks.' },
          { label: 'System & Governance → Access & Roles', description: 'Role assignments across Admin, Dispatcher, Driver, Corporate, and Customer.' },
          { label: 'System & Governance → Activity Log', description: 'System-wide audit log of operator and admin actions.' },
          { label: 'System & Governance → Universal Archive', description: 'Central restore bin for archived entities across all modules.' },
          { label: 'System & Governance → Maintenance', description: 'Site availability controls and system maintenance tools.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Why are softphone calls or SMS messages not sending in Dispatch?',
        answer:
          'Verify under Comms & Integrations → Phone, SMS & Templates that telephony is enabled and valid server credentials are configured in your deployment environment.',
      },
      {
        question: 'How do I restore an accidentally archived rate, vehicle, or trip?',
        answer:
          'Open System & Governance → Universal Archive, filter by the entity type, and use the Restore action on the archived record.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/admin/advanced-integrations.png',
        alt: 'Comms & Integrations and System & Governance tabs in Admin Console',
        caption: 'Configuring payment/telephony integrations and reviewing System & Governance logs.',
      },
    ],
  },
];
